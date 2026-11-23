#!/usr/bin/env node
/**
 * money-flows.mjs — live end-to-end money-flow harness.
 *
 * Drives the running local stack through the public gateway
 * (http://localhost:18082/api) exactly as a real client would, then asserts
 * the ledger and the chains stayed consistent.
 *
 * Zero dependencies; Node >= 20. See scripts/e2e/README.md.
 *
 *   node scripts/e2e/money-flows.mjs [--fast] [--only=step,...] [--timeout-min=40]
 *
 * --fast skips the on-chain steps (issuance, bridge, redeem) and the chain
 * reads, so a run moves fiat only and finishes in ~1 minute. The full run
 * spends testnet funds (Sepolia ETH + devnet SOL) and takes ~45-60 minutes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { fast: false, only: null, timeoutMin: 40 };
  for (const a of argv) {
    if (a === '--fast') opts.fast = true;
    else if (a.startsWith('--only=')) opts.only = a.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--timeout-min=')) opts.timeoutMin = Number(a.slice('--timeout-min='.length)) || 40;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
  }
  return opts;
}

function printHelp() {
  console.log(`Usage: node scripts/e2e/money-flows.mjs [--fast] [--only=<step,...>] [--timeout-min=40]

  --fast             skip the on-chain steps (issuance, bridge, redeem)
  --only=step,...    run only the named steps, in order
  --timeout-min=N    saga poll timeout in minutes (default 40)

Steps: wallets, deposit, p2p, invoice, withdrawal, issuance, bridge, redeem,
       negatives, reconcile`);
}

// ---------------------------------------------------------------------------
// Config (never printed: passwords, RPC URLs carry credentials)
// ---------------------------------------------------------------------------

const GATEWAY = process.env.E2E_GATEWAY || 'http://localhost:18082/api';
const KEYCLOAK_TOKEN_URL = 'http://localhost:8080/realms/damp/protocol/openid-connect/token';
const KC_CLIENT_ID = 'damp-portal';

// Tiny .env parser: KEY=VALUE lines, no interpolation, no expansion. Secrets
// are read into memory only and never logged.
function parseEnvFile(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const coreLedgerEnv = parseEnvFile(path.join(REPO_ROOT, 'core-ledger', '.env'));
const solanaEnvPath = fs.existsSync(path.join(REPO_ROOT, 'chains', 'solana', '.env'))
  ? path.join(REPO_ROOT, 'chains', 'solana', '.env')
  : path.join(REPO_ROOT, 'core-ledger', '.env');
const solanaEnv = parseEnvFile(solanaEnvPath);

const ETH_RPC_URL = coreLedgerEnv.ETH_RPC_URL;
const USDX_PROXY_ADDRESS = coreLedgerEnv.USDX_PROXY_ADDRESS;
const SOLANA_RPC_URL = solanaEnv.SOLANA_RPC_URL || coreLedgerEnv.SOLANA_RPC_URL;
const USDX_MINT_ADDRESS = solanaEnv.USDX_MINT_ADDRESS || coreLedgerEnv.USDX_MINT_ADDRESS;

// Users and passwords live in the realm export; read at runtime, never echoed.
const realm = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'infra', 'keycloak', 'realms', 'damp-realm.json'), 'utf8'));
function realmPassword(username) {
  const u = realm.users.find((x) => x.username === username);
  const c = u?.credentials?.find((x) => x.type === 'password');
  if (!c?.value) throw new Error(`no password for ${username} in damp-realm.json`);
  return c.value;
}

const USERS = {
  customer: 'customer@damp.local',
  company: 'company@damp.local',
  treasury: 'treasury@damp.local',
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const runId = `e2e-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
const ref = (label) => `${label} ${runId}`;

class StepError extends Error {
  constructor(message, detail) {
    super(message);
    this.detail = detail; // optional {status, body} or string payload
  }
}

function assert(cond, message, detail) {
  if (!cond) throw new StepError(message, detail);
}

function decimalsFor(currency) {
  return currency === 'USDX' ? 6 : 2;
}

// Decimal string -> BigInt count of smallest units. Never floats.
function units(str, currency) {
  const d = decimalsFor(currency);
  const s = String(str).trim();
  const neg = s.startsWith('-');
  const u = neg ? s.slice(1) : s;
  const [whole, frac = ''] = u.split('.');
  const padded = whole + (frac + '0'.repeat(d)).slice(0, d);
  const v = BigInt(padded.replace(/^0+(?=\d)/, '') || '0');
  return neg ? -v : v;
}

function fmtUnits(v, currency) {
  const d = decimalsFor(currency);
  const neg = v < 0n;
  const u = neg ? -v : v;
  const s = u.toString().padStart(d + 1, '0');
  return `${neg ? '-' : ''}${s.slice(0, s.length - d)}.${s.slice(-d)}`;
}

// --- Token cache (ROPC via Keycloak, public client damp-portal) -------------

const tokenCache = new Map(); // user -> {token, expiresAtMs}

async function fetchToken(user) {
  const res = await fetch(KEYCLOAK_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: KC_CLIENT_ID,
      username: user,
      password: realmPassword(user),
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new StepError(`token for ${user} failed (${res.status})`, { status: res.status, body });
  }
  // expires_in is seconds; refresh a little early.
  const expiresAtMs = Date.now() + (Number(body.expires_in) || 300) * 1000 - 30_000;
  tokenCache.set(user, { token: body.access_token, expiresAtMs });
  return body.access_token;
}

async function bearer(user) {
  const c = tokenCache.get(user);
  if (c && c.expiresAtMs > Date.now()) return c.token;
  return fetchToken(user);
}

// --- api() ------------------------------------------------------------------

/**
 * api(user, method, path, body, opts) -> {status, body, raw}
 *   user   — username string (USERS.*) or null when opts.auth is 'none'/'garbage'
 *   path   — bff route, e.g. '/wallets' (no /api prefix)
 *   opts.idem — string: use that key; false: omit the header entirely;
 *               undefined: generate a fresh uuid for writes
 *   opts.auth — 'none' (no Authorization), 'garbage' (Bearer garbage),
 *               or a string token to force; default: resolve user's token
 */
async function api(user, method, path, body, opts = {}) {
  const headers = { 'content-type': 'application/json' };

  if (opts.auth === 'none') {
    // no Authorization header
  } else if (opts.auth === 'garbage') {
    headers.authorization = 'Bearer garbage.not.a.real.token';
  } else if (typeof opts.auth === 'string') {
    headers.authorization = `Bearer ${opts.auth}`;
  } else if (user) {
    headers.authorization = `Bearer ${await bearer(user)}`;
  }

  const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'DELETE';
  if (isWrite && opts.idem !== false) {
    headers['idempotency-key'] = typeof opts.idem === 'string' ? opts.idem : crypto.randomUUID();
  }

  const res = await fetch(GATEWAY + path, {
    method,
    headers,
    body: isWrite && body !== undefined ? JSON.stringify(body ?? {}) : undefined,
  });

  const raw = await res.text();
  let parsed;
  try {
    parsed = raw === '' ? null : JSON.parse(raw);
  } catch {
    parsed = raw;
  }

  // A 401 on a stale/expired token: refresh once and retry, like a real client
  // with a refresh token would. Only for the normal token path.
  if (res.status === 401 && user && opts.auth === undefined) {
    tokenCache.delete(user);
    headers.authorization = `Bearer ${await bearer(user)}`;
    const res2 = await fetch(GATEWAY + path, {
      method,
      headers,
      body: isWrite && body !== undefined ? JSON.stringify(body ?? {}) : undefined,
    });
    const raw2 = await res2.text();
    let parsed2;
    try { parsed2 = raw2 === '' ? null : JSON.parse(raw2); } catch { parsed2 = raw2; }
    return { status: res2.status, body: parsed2, raw: raw2 };
  }

  return { status: res.status, body: parsed, raw };
}

// --- step() / poll() --------------------------------------------------------

const results = [];

async function step(name, fn) {
  const started = Date.now();
  try {
    const out = await fn();
    const ms = Date.now() - started;
    results.push({ name, result: 'PASS', ids: out?.ids, note: out?.note });
    console.log(`PASS  ${name}  (${(ms / 1000).toFixed(1)}s)`);
    return out;
  } catch (err) {
    const ms = Date.now() - started;
    const e = err instanceof StepError ? err : new StepError(err?.stack || String(err));
    results.push({ name, result: 'FAIL', error: e.message, detail: e.detail });
    console.log(`FAIL  ${name}  (${(ms / 1000).toFixed(1)}s)`);
    if (e.detail?.status !== undefined) {
      console.log(`      response: HTTP ${e.detail.status}`);
      console.log(`      body: ${truncate(JSON.stringify(e.detail.body))}`);
    }
    console.log(`      ${e.message}`);
    return null;
  }
}

function truncate(s, n = 1200) {
  return String(s).length > n ? String(s).slice(0, n) + '…' : String(s);
}

async function poll(fn, until, timeoutMs, intervalMs, label = 'poll') {
  const deadline = Date.now() + timeoutMs;
  let dots = 0;
  for (;;) {
    const v = await fn();
    if (until(v)) return v;
    if (Date.now() > deadline) {
      throw new StepError(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`, { body: v });
    }
    process.stdout.write('.');
    if (++dots % 40 === 0) process.stdout.write('\n');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// --- Operator reads (treasury holds ledger:read / transactions:read:any /
//     reserves:read) ---------------------------------------------------------

let treasuryToken; // reused across invariants() and reconciliation reads

async function invariants() {
  const t = await bearer(USERS.treasury);
  const [tb, integ] = await Promise.all([
    api(USERS.treasury, 'GET', '/ledger/trial-balance?currency=USD'),
    api(USERS.treasury, 'GET', '/ledger/integrity'),
  ]);
  assert(tb.status === 200, `trial balance read failed (HTTP ${tb.status})`, { status: tb.status, body: tb.body });
  assert(tb.body?.balanced === true, 'trial balance is NOT balanced', { status: tb.status, body: tb.body });
  assert(integ.status === 200, `integrity read failed (HTTP ${integ.status})`, { status: integ.status, body: integ.body });
  assert(integ.body?.healthy === true, 'ledger integrity check is NOT healthy', { status: integ.status, body: integ.body });
}

// --- Chain reads ------------------------------------------------------------

function readEthTotalSupply() {
  const out = execFileSync('cast', ['call', USDX_PROXY_ADDRESS, 'totalSupply()(uint256)', '--rpc-url', ETH_RPC_URL], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return BigInt(out.split(/\s+/)[0]); // cast prints "123 [1.23e2]"
}

function readEthDecimals() {
  const out = execFileSync('cast', ['call', USDX_PROXY_ADDRESS, 'decimals()(uint8)', '--rpc-url', ETH_RPC_URL], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return Number(out.split(/\s+/)[0]);
}

async function readSolSupply() {
  const res = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenSupply', params: [USDX_MINT_ADDRESS] }),
  });
  const j = await res.json();
  if (j.error) throw new StepError(`getTokenSupply failed: ${JSON.stringify(j.error)}`);
  return { amount: BigInt(j.result.value.amount), decimals: Number(j.result.value.decimals) };
}

// --- Context -----------------------------------------------------------------

const ctx = {};

// ---------------------------------------------------------------------------
// Step 1 — wallets
// ---------------------------------------------------------------------------

async function stepWallets() {
  const cW = (await api(USERS.customer, 'GET', '/wallets')).body;
  assert(Array.isArray(cW), 'customer GET /wallets did not return an array', { body: cW });

  let cUsd = cW.find((w) => w.currency === 'USD' && !w.chain);
  let cEth = cW.find((w) => w.currency === 'USDX' && w.chain === 'ETHEREUM');
  let cSol = cW.find((w) => w.currency === 'USDX' && w.chain === 'SOLANA');

  // listOwnWallets ensures the default USD fiat wallet; the USD-X wallets are
  // opened explicitly (idempotent on (user, currency, chain)).
  // Ethereum is self-custody here (only Solana is platform-custodied), so the
  // caller supplies a valid address — a real client supplies its own; the
  // harness mints a throwaway valid one it never needs to control, because the
  // bridge/burn authority is the relayer's BRIDGE_ROLE, not the holder.
  if (!cEth) {
    const ethAddress = '0x' + crypto.randomBytes(20).toString('hex');
    cEth = (await api(USERS.customer, 'POST', '/wallets/usdx', { chain: 'ETHEREUM', address: ethAddress })).body;
  }
  if (!cSol) cSol = (await api(USERS.customer, 'POST', '/wallets/usdx', { chain: 'SOLANA' })).body;

  const coW = (await api(USERS.company, 'GET', '/wallets')).body;
  const coUsd = coW.find((w) => w.currency === 'USD' && !w.chain);

  assert(cUsd?.id, 'no customer USD fiat wallet');
  assert(cEth?.id, 'no customer USD-X ETHEREUM wallet');
  assert(cSol?.id, 'no customer USD-X SOLANA wallet');
  assert(coUsd?.id, 'no company USD fiat wallet');

  ctx.customer = { usd: cUsd, usdxEth: cEth, usdxSol: cSol, partyId: cUsd.userId };
  ctx.company = { usd: coUsd, partyId: coUsd.userId };

  return {
    ids: {
      customerUsd: cUsd.id,
      customerUsdxEth: cEth.id,
      customerUsdxSol: cSol.id,
      companyUsd: coUsd.id,
      customerPartyId: cUsd.userId,
      companyPartyId: coUsd.userId,
    },
  };
}

// --- shared helpers ---------------------------------------------------------

async function walletBalance(walletId, user) {
  const r = await api(user, 'GET', `/wallets/${walletId}`);
  assert(r.status === 200, `GET /wallets/${walletId} -> ${r.status}`, { status: r.status, body: r.body });
  return r.body.balance.amount;
}

function diffUnits(after, before, currency) {
  return units(after, currency) - units(before, currency);
}

// ---------------------------------------------------------------------------
// Step 2 — deposit
// ---------------------------------------------------------------------------

async function stepDeposit() {
  const before = await walletBalance(ctx.customer.usd.id, USERS.customer);

  const created = await api(USERS.customer, 'POST', '/payment-intents', {
    direction: 'DEPOSIT',
    amount: '200.00',
    currency: 'USD',
    description: ref('e2e deposit'),
  });
  assert(created.status >= 200 && created.status < 300, `deposit intent create -> ${created.status}`, { status: created.status, body: created.body });
  const intentId = created.body.id;

  const intent = await poll(
    () => api(USERS.customer, 'GET', `/payment-intents/${intentId}`),
    (r) => r.status !== 200 || ['SETTLED', 'FAILED'].includes(r.body?.status),
    30_000,
    500,
    `deposit intent ${intentId}`,
  );
  assert(intent.body?.status === 'SETTLED', `deposit not settled: ${intent.body?.status}`, { status: intent.status, body: intent.body });
  assert(intent.body?.ledgerTxId, 'deposit intent has no ledgerTxId', { body: intent.body });

  const after = await walletBalance(ctx.customer.usd.id, USERS.customer);
  const delta = diffUnits(after, before, 'USD');
  assert(delta === 20000n, `customer USD balance rose ${fmtUnits(delta, 'USD')}, expected 200.00`, { body: { before, after, ledgerTxId: intent.body.ledgerTxId } });

  // Confirm the exact posting on the wallet's own statement (a customer can
  // read this; the entry's amount is the authoritative figure, fees or no fees).
  const stmt = await api(USERS.customer, 'GET', `/wallets/${ctx.customer.usd.id}/statement?limit=20`);
  const entry = stmt.body?.entries?.find((e) => e.transactionId === intent.body.ledgerTxId);
  assert(entry, 'deposit posting missing from wallet statement', { body: stmt.body });
  assert(entry.amount?.amount === '200.00' && entry.direction === 'CREDIT',
    `deposit posting was ${entry.direction} ${JSON.stringify(entry.amount)}, expected CREDIT 200.00`, { body: entry });

  await invariants();

  ctx.deposit = { intentId, ledgerTxId: intent.body.ledgerTxId };
  return { ids: { depositIntentId: intentId, depositLedgerTxId: intent.body.ledgerTxId } };
}

// ---------------------------------------------------------------------------
// Step 3 — p2p (customer -> company, TRANSFER payment intent)
// ---------------------------------------------------------------------------

async function stepP2p() {
  const ben = await api(USERS.customer, 'POST', '/banks/beneficiaries', {
    name: `Company ${runId}`,
    kind: 'WALLET',
    accountRef: `e2e-${runId}-company`,
    currency: 'USD',
    targetPartyId: ctx.company.partyId,
  });
  assert(ben.status >= 200 && ben.status < 300 && ben.body?.id, 'beneficiary register failed', { status: ben.status, body: ben.body });

  const beforeCust = await walletBalance(ctx.customer.usd.id, USERS.customer);
  const beforeCo = await walletBalance(ctx.company.usd.id, USERS.company);

  const idempotencyKey = crypto.randomUUID();
  const body = { direction: 'TRANSFER', amount: '10.00', currency: 'USD', beneficiaryId: ben.body.id, description: ref('e2e p2p') };
  const created = await api(USERS.customer, 'POST', '/payment-intents', body, { idem: idempotencyKey });
  assert(created.status >= 200 && created.status < 300, `p2p intent create -> ${created.status}`, { status: created.status, body: created.body });
  const intentId = created.body.id;

  // internal rail settles inline, but poll to be certain and to see the state.
  const intent = await poll(
    () => api(USERS.customer, 'GET', `/payment-intents/${intentId}`),
    (r) => r.status !== 200 || ['SETTLED', 'FAILED'].includes(r.body?.status),
    30_000,
    500,
    `p2p intent ${intentId}`,
  );
  assert(intent.body?.status === 'SETTLED', `p2p not settled: ${intent.body?.status}`, { status: intent.status, body: intent.body });

  const afterCust = await walletBalance(ctx.customer.usd.id, USERS.customer);
  const afterCo = await walletBalance(ctx.company.usd.id, USERS.company);
  assert(diffUnits(afterCust, beforeCust, 'USD') === -1000n, `customer moved ${fmtUnits(diffUnits(afterCust, beforeCust, 'USD'), 'USD')}, expected -10.00`);
  assert(diffUnits(afterCo, beforeCo, 'USD') === 1000n, `company moved ${fmtUnits(diffUnits(afterCo, beforeCo, 'USD'), 'USD')}, expected +10.00`);

  await invariants();

  // Saved for the replay negative check.
  ctx.p2p = { idempotencyKey, body, firstStatus: created.status, firstBody: created.body, intentId, ledgerTxId: intent.body.ledgerTxId, beneficiaryId: ben.body.id };
  return { ids: { p2pIntentId: intentId, p2pLedgerTxId: intent.body.ledgerTxId, beneficiaryId: ben.body.id } };
}

// ---------------------------------------------------------------------------
// Step 4 — invoice (company issues, customer pays)
// ---------------------------------------------------------------------------

async function stepInvoice() {
  const inv = await api(USERS.company, 'POST', '/invoices', {
    amount: '7.50',
    currency: 'USD',
    payerPartyId: ctx.customer.partyId,
    description: ref('e2e invoice'),
  });
  assert(inv.status >= 200 && inv.status < 300 && inv.body?.id, 'invoice create failed', { status: inv.status, body: inv.body });
  assert(inv.body.status === 'OPEN', `invoice not OPEN: ${inv.body.status}`, { body: inv.body });

  const beforeCust = await walletBalance(ctx.customer.usd.id, USERS.customer);
  const beforeCo = await walletBalance(ctx.company.usd.id, USERS.company);

  const pay = await api(USERS.customer, 'POST', `/invoices/${inv.body.id}/pay`, { beneficiaryId: ctx.p2p.beneficiaryId });
  assert(pay.status >= 200 && pay.status < 300, `invoice pay -> ${pay.status}`, { status: pay.status, body: pay.body });

  const paid = await poll(
    () => api(USERS.customer, 'GET', `/invoices/${inv.body.id}`),
    (r) => r.status !== 200 || ['PAID', 'VOID', 'FAILED'].includes(r.body?.status),
    30_000,
    500,
    `invoice ${inv.body.id}`,
  );
  assert(paid.body?.status === 'PAID', `invoice not PAID: ${paid.body?.status}`, { status: paid.status, body: paid.body });

  const afterCust = await walletBalance(ctx.customer.usd.id, USERS.customer);
  const afterCo = await walletBalance(ctx.company.usd.id, USERS.company);
  assert(diffUnits(afterCust, beforeCust, 'USD') === -750n, `customer moved ${fmtUnits(diffUnits(afterCust, beforeCust, 'USD'), 'USD')}, expected -7.50`);
  assert(diffUnits(afterCo, beforeCo, 'USD') === 750n, `company moved ${fmtUnits(diffUnits(afterCo, beforeCo, 'USD'), 'USD')}, expected +7.50`);

  await invariants();

  return { ids: { invoiceId: inv.body.id, invoiceNumber: inv.body.number, payIntentId: pay.body?.id } };
}

// ---------------------------------------------------------------------------
// Step 5 — withdrawal (customer -> verified stub-rail bank account)
// ---------------------------------------------------------------------------

async function stepWithdrawal() {
  const banks = await api(USERS.customer, 'GET', '/banks/available');
  assert(Array.isArray(banks.body) && banks.body.length > 0, 'no banks available', { body: banks.body });
  const bank = banks.body.find((b) => b.rail === 'stub') || banks.body[0];

  const acct = await api(USERS.customer, 'POST', '/banks/register', {
    bankId: bank.id,
    accountName: 'E2E Test Account',
    accountNumber: `9999${runId.slice(-4)}`.replace(/\D/g, ''),
    currency: 'USD',
  });
  assert(acct.status >= 200 && acct.status < 300 && acct.body?.id, 'bank account register failed', { status: acct.status, body: acct.body });

  const linked = await api(USERS.customer, 'POST', '/banks/link', { accountId: acct.body.id });
  assert(linked.body?.status === 'VERIFIED', `bank account not VERIFIED: ${linked.body?.status}`, { status: linked.status, body: linked.body });

  const before = await walletBalance(ctx.customer.usd.id, USERS.customer);

  const created = await api(USERS.customer, 'POST', '/payment-intents', {
    direction: 'WITHDRAWAL',
    amount: '5.00',
    currency: 'USD',
    bankAccountId: acct.body.id,
    description: ref('e2e withdrawal'),
  });
  assert(created.status >= 200 && created.status < 300, `withdrawal intent create -> ${created.status}`, { status: created.status, body: created.body });
  const intentId = created.body.id;

  const intent = await poll(
    () => api(USERS.customer, 'GET', `/payment-intents/${intentId}`),
    (r) => r.status !== 200 || ['SETTLED', 'FAILED'].includes(r.body?.status),
    30_000,
    500,
    `withdrawal intent ${intentId}`,
  );
  assert(intent.body?.status === 'SETTLED', `withdrawal not settled: ${intent.body?.status}`, { status: intent.status, body: intent.body });

  const after = await walletBalance(ctx.customer.usd.id, USERS.customer);
  assert(diffUnits(after, before, 'USD') === -500n, `customer moved ${fmtUnits(diffUnits(after, before, 'USD'), 'USD')}, expected -5.00`);

  await invariants();

  return { ids: { bankId: bank.id, bankAccountId: acct.body.id, withdrawalIntentId: intentId, withdrawalLedgerTxId: intent.body.ledgerTxId } };
}

// ---------------------------------------------------------------------------
// Steps 6-8 — on-chain (skipped with --fast)
// ---------------------------------------------------------------------------

async function sagaPoll(correlationId, kind, timeoutMs) {
  return poll(
    () => api(USERS.customer, 'GET', `/transfers/${correlationId}`),
    (r) => r.status !== 200 || ['COMPLETED', 'FAILED', 'COMPENSATED'].includes(r.body?.status),
    timeoutMs,
    10_000,
    `${kind} saga ${correlationId}`,
  );
}

async function stepIssuance() {
  const decimals = readEthDecimals();
  const ethBefore = readEthTotalSupply();
  const usdxBefore = await walletBalance(ctx.customer.usdxEth.id, USERS.customer);

  const r = await api(USERS.customer, 'POST', '/issuances', {
    fiatWalletId: ctx.customer.usd.id,
    usdxWalletId: ctx.customer.usdxEth.id,
    amount: '50.00',
  });
  assert(r.status === 202, `issuance -> ${r.status}`, { status: r.status, body: r.body });
  const corrId = r.body.correlationId;

  const t = await sagaPoll(corrId, 'issuance', opts.timeoutMin * 60_000);
  assert(t.body?.status === 'COMPLETED', `issuance saga ${t.body?.status}: ${t.body?.lastError}`, { status: t.status, body: t.body });

  const ethAfter = readEthTotalSupply();
  const expectedDelta = 50n * 10n ** BigInt(decimals);
  assert(ethAfter - ethBefore === expectedDelta, `ETH supply delta ${ethAfter - ethBefore}, expected ${expectedDelta}`);

  const usdxAfter = await walletBalance(ctx.customer.usdxEth.id, USERS.customer);
  assert(diffUnits(usdxAfter, usdxBefore, 'USDX') === 50_000_000n, `ETH USD-X wallet moved ${fmtUnits(diffUnits(usdxAfter, usdxBefore, 'USDX'), 'USDX')}, expected +50.000000`);

  await invariants();

  const hash = t.body.sourceTxHash || t.body.destTxHash;
  const url = t.body.sourceTxUrl || t.body.destTxUrl;
  return { ids: { issuanceCorrelationId: corrId, issuanceTxHash: hash, issuanceExplorerUrl: url }, note: `tx ${hash} ${url || ''}` };
}

async function stepBridge() {
  const ethBefore = readEthTotalSupply();
  const solBefore = await readSolSupply();
  const ethWalletBefore = await walletBalance(ctx.customer.usdxEth.id, USERS.customer);
  const solWalletBefore = await walletBalance(ctx.customer.usdxSol.id, USERS.customer);

  const r = await api(USERS.customer, 'POST', '/bridges', {
    fromWalletId: ctx.customer.usdxEth.id,
    toWalletId: ctx.customer.usdxSol.id,
    amount: '20.00',
  });
  assert(r.status === 202, `bridge -> ${r.status}`, { status: r.status, body: r.body });
  const corrId = r.body.correlationId;

  const t = await sagaPoll(corrId, 'bridge', opts.timeoutMin * 60_000);
  assert(t.body?.status === 'COMPLETED', `bridge saga ${t.body?.status}: ${t.body?.lastError}`, { status: t.status, body: t.body });

  const ethAfter = readEthTotalSupply();
  const solAfter = await readSolSupply();
  const ethDec = readEthDecimals();
  assert(ethAfter - ethBefore === -(20n * 10n ** BigInt(ethDec)), `ETH supply delta ${ethAfter - ethBefore}, expected -20 * 10^${ethDec}`);
  assert(solAfter.amount - solBefore.amount === 20n * 10n ** BigInt(solAfter.decimals), `Solana supply delta ${solAfter.amount - solBefore.amount}, expected +20 * 10^${solAfter.decimals}`);

  const ethWalletAfter = await walletBalance(ctx.customer.usdxEth.id, USERS.customer);
  const solWalletAfter = await walletBalance(ctx.customer.usdxSol.id, USERS.customer);
  assert(diffUnits(ethWalletAfter, ethWalletBefore, 'USDX') === -20_000_000n, 'ETH USD-X wallet did not move -20.000000');
  assert(diffUnits(solWalletAfter, solWalletBefore, 'USDX') === 20_000_000n, 'SOL USD-X wallet did not move +20.000000');

  await invariants();

  const hash = t.body.sourceTxHash || t.body.destTxHash;
  const url = t.body.sourceTxUrl || t.body.destTxUrl;
  return { ids: { bridgeCorrelationId: corrId, bridgeTxHash: hash, bridgeExplorerUrl: url }, note: `tx ${hash} ${url || ''}` };
}

async function stepRedeem() {
  const fiatBefore = await walletBalance(ctx.customer.usd.id, USERS.customer);

  // Redeem 10 from Solana first, then 10 from Ethereum — sequentially.
  const solBefore = await readSolSupply();
  const r1 = await api(USERS.customer, 'POST', '/redemptions', {
    usdxWalletId: ctx.customer.usdxSol.id,
    fiatWalletId: ctx.customer.usd.id,
    amount: '10.00',
  });
  assert(r1.status === 202, `sol redemption -> ${r1.status}`, { status: r1.status, body: r1.body });
  const t1 = await sagaPoll(r1.body.correlationId, 'sol redeem', opts.timeoutMin * 60_000);
  assert(t1.body?.status === 'COMPLETED', `sol redeem saga ${t1.body?.status}: ${t1.body?.lastError}`, { status: t1.status, body: t1.body });
  const solAfter = await readSolSupply();
  assert(solAfter.amount - solBefore.amount === -(10n * 10n ** BigInt(solAfter.decimals)), `Solana supply delta ${solAfter.amount - solBefore.amount}`);

  const ethBefore = readEthTotalSupply();
  const r2 = await api(USERS.customer, 'POST', '/redemptions', {
    usdxWalletId: ctx.customer.usdxEth.id,
    fiatWalletId: ctx.customer.usd.id,
    amount: '10.00',
  });
  assert(r2.status === 202, `eth redemption -> ${r2.status}`, { status: r2.status, body: r2.body });
  const t2 = await sagaPoll(r2.body.correlationId, 'eth redeem', opts.timeoutMin * 60_000);
  assert(t2.body?.status === 'COMPLETED', `eth redeem saga ${t2.body?.status}: ${t2.body?.lastError}`, { status: t2.status, body: t2.body });
  const ethAfter = readEthTotalSupply();
  const ethDec = readEthDecimals();
  assert(ethAfter - ethBefore === -(10n * 10n ** BigInt(ethDec)), `ETH supply delta ${ethAfter - ethBefore}`);

  // Fiat credited per the ledger posting: two 10.00 credits.
  const fiatAfter = await walletBalance(ctx.customer.usd.id, USERS.customer);
  assert(diffUnits(fiatAfter, fiatBefore, 'USD') === 2000n, `fiat moved ${fmtUnits(diffUnits(fiatAfter, fiatBefore, 'USD'), 'USD')}, expected +20.00`);

  await invariants();

  return { ids: { solRedeemCorrelationId: r1.body.correlationId, ethRedeemCorrelationId: r2.body.correlationId } };
}

// ---------------------------------------------------------------------------
// Step 9 — negative checks (always run)
// ---------------------------------------------------------------------------

function subcheck(name, ok, extra) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  ${mark}  ${name}${ok ? '' : `  ${extra || ''}`}`);
  return ok;
}

async function stepNegatives() {
  let all = true;
  const bal = async () => ({
    cust: units(await walletBalance(ctx.customer.usd.id, USERS.customer), 'USD'),
    co: units(await walletBalance(ctx.company.usd.id, USERS.company), 'USD'),
  });

  // (a) replay step 3's transfer with the SAME Idempotency-Key
  {
    const before = await bal();
    const r = await api(USERS.customer, 'POST', '/payment-intents', ctx.p2p.body, { idem: ctx.p2p.idempotencyKey });
    const after = await bal();
    const sameBody = JSON.stringify(r.body) === JSON.stringify(ctx.p2p.firstBody);
    const noSecondPosting = after.cust === before.cust && after.co === before.co;
    const ok = r.status === ctx.p2p.firstStatus && sameBody && noSecondPosting;
    all &= subcheck('replay same idempotency key → identical body, no second posting', ok,
      `status ${r.status} vs ${ctx.p2p.firstStatus}, sameBody=${sameBody}, noSecondPosting=${noSecondPosting}`);
  }

  // (b) overdraw: customer transfer of 1,000,000.00 USD
  {
    const before = await bal();
    const r = await api(USERS.customer, 'POST', '/transfers', {
      fromWalletId: ctx.customer.usd.id,
      toWalletId: ctx.company.usd.id,
      amount: '1000000.00',
      reference: ref('e2e overdraw'),
    }, { idem: true });
    const after = await bal();
    const ok = r.status >= 400 && r.status < 500 && after.cust === before.cust && after.co === before.co;
    all &= subcheck('overdraw 1,000,000.00 USD refused 4xx', ok, `status ${r.status} body=${truncate(JSON.stringify(r.body))}`);
  }

  // (c) cross-user / operator-only
  {
    const r1 = await api(USERS.customer, 'POST', '/transfers', { fromWalletId: ctx.company.usd.id, toWalletId: ctx.customer.usd.id, amount: '1.00' }, { idem: true });
    all &= subcheck('customer transfer from company wallet → 403', r1.status === 403, `status ${r1.status}`);

    const r2 = await api(USERS.customer, 'POST', '/withdrawals', { walletId: ctx.customer.usd.id, amount: '1.00' }, { idem: true });
    all &= subcheck('customer POST /withdrawals (operator-only) → 403', r2.status === 403, `status ${r2.status}`);

    const r3 = await api(USERS.customer, 'POST', '/issuances', { fiatWalletId: ctx.company.usd.id, usdxWalletId: ctx.customer.usdxEth.id, amount: '1.00' }, { idem: true });
    all &= subcheck('customer issuance on company wallet → 403', r3.status === 403, `status ${r3.status}`);

    const r4 = await api(USERS.customer, 'POST', '/bridges', { fromWalletId: ctx.company.usd.id, toWalletId: ctx.customer.usdxEth.id, amount: '1.00' }, { idem: true });
    all &= subcheck('customer bridge on company wallet → 403', r4.status === 403, `status ${r4.status}`);
  }

  // (d) customer POST /deposits (manual operator credit) → 403
  {
    const r = await api(USERS.customer, 'POST', '/deposits', { walletId: ctx.customer.usd.id, amount: '1.00' }, { idem: true });
    all &= subcheck('customer POST /deposits (operator-only) → 403', r.status === 403, `status ${r.status}`);
  }

  // (e) missing / garbage token → 401
  {
    const r1 = await api(null, 'GET', '/wallets', undefined, { auth: 'none' });
    all &= subcheck('no token → 401', r1.status === 401, `status ${r1.status}`);
    const r2 = await api(null, 'GET', '/wallets', undefined, { auth: 'garbage' });
    all &= subcheck('garbage token → 401', r2.status === 401, `status ${r2.status}`);
  }

  // (f) missing Idempotency-Key on a money write → 400
  {
    const r = await api(USERS.customer, 'POST', '/transfers', { fromWalletId: ctx.customer.usd.id, toWalletId: ctx.company.usd.id, amount: '1.00' }, { idem: false });
    all &= subcheck('missing Idempotency-Key → 400', r.status === 400, `status ${r.status}`);
  }

  assert(all, 'one or more negative checks failed');
  return { note: 'all negative checks passed' };
}

// ---------------------------------------------------------------------------
// Step 10 — reconciliation
// ---------------------------------------------------------------------------

function runReconcile() {
  // core-ledger's config.Load reads the process environment only, so export
  // core-ledger/.env into the child's environment. Build to a temp file and
  // exec that rather than `go run` (which `make reconcile` uses): `go run`
  // re-exits 1 for ANY non-zero program exit, which would erase the reconcile
  // binary's own contract (0 ok, 2 breaks, 1 could-not-check —
  // core-ledger/cmd/reconcile/main.go).
  const env = { ...process.env, ...coreLedgerEnv };
  const cwd = path.join(REPO_ROOT, 'core-ledger');
  const bin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'usdx-reconcile-')), 'reconcile');

  const build = spawnSync('go', ['build', '-o', bin, './cmd/reconcile'], {
    cwd, encoding: 'utf8', env, timeout: 240_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (build.status !== 0) {
    return { exitCode: 1, log: `${build.stdout ?? ''}\n${build.stderr ?? ''}`.trim(), buildFailed: true };
  }

  const run = spawnSync(bin, ['--triggered-by', 'operator'], {
    cwd, encoding: 'utf8', env, timeout: 240_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { exitCode: run.status ?? 1, log: `${run.stdout ?? ''}\n${run.stderr ?? ''}`.trim(), buildFailed: false };
}

// The reconcile binary logs one JSON line per event (slog). Pull the leg
// outcomes out of that — this is the fallback when the /reserves/* HTTP read
// is unavailable.
function summarizeReconcile(log) {
  const legs = {};
  let ok = false;
  let breaks = false;
  let errored = false;
  for (const line of String(log).split('\n')) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.msg === 'reconciliation OK') ok = true;
    else if (o.msg === 'reconciliation found breaks') breaks = true;
    else if (o.msg === 'reconciliation could not be performed') errored = true;
    else if (o.msg === 'reconciliation break') legs[o.leg] = { code: o.code, drift: o.drift, detail: o.detail };
    else if (o.msg === 'Leg C skipped: no custodian has reported a balance yet') legs.LEG_C = { skipped: true };
  }
  return { ok, breaks, errored, legs };
}

// --- Leg A delta snapshots ---------------------------------------------------

let reconBaseline = null; // captured before any money moves

// Leg A drift is the one number a run must not change: on-chain supply minus
// what the journal says should be on chain, (eth + sol) − (issued − in_transit).
// A pre-existing break is fine as long as the run leaves the drift where it
// found it — the ledger and the chains move together.
function bigOrNull(s) {
  return s === null || s === undefined ? null : BigInt(s);
}

function hasTerms(s) {
  return s.drift !== null && s.issued !== null && s.inTransit !== null && s.eth !== null && s.sol !== null;
}

function describeLeg(name, v) {
  if (v === true) return 'ok';
  if (v === false) return 'BROKEN';
  return name === 'LegC' ? 'skipped (no custodian balance)' : 'not evaluated';
}

function describeTerms(s) {
  return `drift=${s.drift ?? '?'} issued=${s.issued ?? '?'} in_transit=${s.inTransit ?? '?'} eth=${s.eth ?? '?'} sol=${s.sol ?? '?'}`;
}

function snapshotFromRun(run) {
  const issued = bigOrNull(run.issued);
  const inTransit = bigOrNull(run.in_transit);
  const eth = bigOrNull(run.eth_supply);
  const sol = bigOrNull(run.sol_supply);
  const drift = (issued === null || inTransit === null || eth === null || sol === null)
    ? null
    : eth + sol - issued + inTransit;
  return {
    drift, issued, inTransit, eth, sol,
    legAOk: run.leg_a_ok, legBOk: run.leg_b_ok, legCOk: run.leg_c_ok,
    status: run.status, id: run.id, source: 'http',
  };
}

function snapshotFromLog(log) {
  const sum = summarizeReconcile(log);
  return {
    drift: sum.legs.LEG_A?.drift != null ? BigInt(sum.legs.LEG_A.drift) : 0n,
    issued: null, inTransit: null, eth: null, sol: null,
    legAOk: sum.legs.LEG_A ? false : true,
    legBOk: sum.legs.LEG_B ? false : true,
    legCOk: sum.legs.LEG_C ? (sum.legs.LEG_C.skipped ? null : false) : true,
    status: sum.breaks ? 'BREAKS' : (sum.ok ? 'OK' : (sum.errored ? 'ERROR' : 'UNKNOWN')),
    id: null, source: 'log',
  };
}

async function readLatestRun() {
  const rr = await api(USERS.treasury, 'GET', '/reserves/reconciliation-runs');
  if (rr.status === 200 && Array.isArray(rr.body?.runs) && rr.body.runs.length > 0) {
    return { ok: true, run: rr.body.runs[0] };
  }
  return { ok: false, status: rr.status, body: rr.body };
}

// captureReconciliation triggers one reconcile run and returns a snapshot of
// the Leg A terms and the leg verdicts. It prefers the HTTP run row (exposed
// to the treasury operator over /reserves/reconciliation-runs) and falls back
// to the reconcile binary's own log when that route is unavailable.
async function captureReconciliation() {
  const rc = runReconcile();
  const http = await readLatestRun();
  if (http.ok) {
    return { ...snapshotFromRun(http.run), exitCode: rc.exitCode, log: rc.log };
  }
  const snap = snapshotFromLog(rc.log);
  snap.exitCode = rc.exitCode;
  snap.log = rc.log;
  if (rc.exitCode !== 0 && rc.exitCode !== 2) {
    console.log(`  (reconcile could not be performed, exit ${rc.exitCode}; HTTP run read -> ${http.status})`);
  }
  return snap;
}

async function stepReconcile() {
  const after = await captureReconciliation();
  const before = reconBaseline;

  // The reconcile binary exits 1 when the check could not be performed; a delta
  // computed against a stale/absent run would be meaningless, so fail instead.
  assert(after.exitCode === 0 || after.exitCode === 2,
    `reconcile could not be performed (exit ${after.exitCode})`,
    { log: truncate(after.log, 1200) });

  console.log(`  reconcile exit=${after.exitCode}  status=${after.status}  id=${after.id ?? '(log)'}`);
  console.log(`  legs  LegA=${describeLeg('LegA', after.legAOk)} LegB=${describeLeg('LegB', after.legBOk)} LegC=${describeLeg('LegC', after.legCOk)}`);

  // Leg B is the 1:1 peg; it must be ok. Leg C is skipped until a custodian
  // reports a balance — reported, not failed.
  assert(after.legBOk === true, `Leg B is not ok (leg_b_ok=${after.legBOk})`, { status: after.status, id: after.id });
  if (after.legCOk === false) {
    assert(false, 'Leg C reports a custodian shortfall', { legCOk: after.legCOk });
  }

  const legs = `LegA=${describeLeg('LegA', after.legAOk)} LegB=${describeLeg('LegB', after.legBOk)} LegC=${describeLeg('LegC', after.legCOk)}`;
  if (before) {
    console.log(`  Leg A  before  ${describeTerms(before)}`);
    console.log(`  Leg A  after   ${describeTerms(after)}`);
    if (hasTerms(before) && hasTerms(after)) {
      const d = after.drift - before.drift;
      console.log(`  deltas  drift=${d} issued=${after.issued - before.issued} in_transit=${after.inTransit - before.inTransit} eth=${after.eth - before.eth} sol=${after.sol - before.sol}`);
      if (before.drift !== 0n) {
        console.log(`  KNOWN: pre-existing Leg A drift ${before.drift} — the run must not change it`);
      }
      assert(after.drift === before.drift,
        `Leg A drift changed across the run: before=${before.drift} after=${after.drift} (delta ${d})`,
        { before: describeTerms(before), after: describeTerms(after) });
    } else if (before.drift !== null && after.drift !== null) {
      const d = after.drift - before.drift;
      console.log(`  delta  drift=${d}`);
      if (before.drift !== 0n) {
        console.log(`  KNOWN: pre-existing Leg A drift ${before.drift} — the run must not change it`);
      }
      assert(after.drift === before.drift,
        `Leg A drift changed across the run: before=${before.drift} after=${after.drift} (delta ${d})`,
        { before: describeTerms(before), after: describeTerms(after) });
    } else {
      console.log('  (Leg A terms unavailable — skipped the drift comparison)');
    }
  } else {
    console.log(`  Leg A  ${describeTerms(after)}`);
    if (after.drift !== null && after.drift !== 0n) {
      console.log(`  KNOWN: Leg A drift ${after.drift} present, no baseline captured`);
    }
  }

  return {
    ids: after.id ? { reconciliationRunId: after.id } : undefined,
    note: `reconcile exit=${after.exitCode} status=${after.status} ${legs}`,
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const STEPS = [
  { name: 'wallets', fn: stepWallets, money: false, onchain: false },
  { name: 'deposit', fn: stepDeposit, money: true, onchain: false },
  { name: 'p2p', fn: stepP2p, money: true, onchain: false },
  { name: 'invoice', fn: stepInvoice, money: true, onchain: false },
  { name: 'withdrawal', fn: stepWithdrawal, money: true, onchain: false },
  { name: 'issuance', fn: stepIssuance, money: true, onchain: true },
  { name: 'bridge', fn: stepBridge, money: true, onchain: true },
  { name: 'redeem', fn: stepRedeem, money: true, onchain: true },
  { name: 'negatives', fn: stepNegatives, money: false, onchain: false },
  { name: 'reconcile', fn: stepReconcile, money: false, onchain: false },
];

const opts = parseArgs(process.argv.slice(2));

async function main() {
  console.log(`money-flows  run=${runId}  mode=${opts.fast ? 'fast' : 'full'}  gateway=${GATEWAY}`);
  if (opts.only) console.log(`  only: ${opts.only.join(', ')}`);

  // Reconcile once up front so the final reconcile step can assert the run did
  // not change Leg A's drift (the dev ledger carries a pre-existing break).
  const runsReconcile = !opts.only || opts.only.includes('reconcile');
  if (runsReconcile) {
    console.log('reconciling baseline before any money moves…');
    reconBaseline = await captureReconciliation();
    console.log(`  baseline  ${describeTerms(reconBaseline)}`);
  }

  for (const s of STEPS) {
    if (opts.only && !opts.only.includes(s.name)) continue;
    if (opts.fast && s.onchain) {
      console.log(`SKIP  ${s.name}  (--fast)`);
      results.push({ name: s.name, result: 'SKIP' });
      continue;
    }
    await step(s.name, s.fn);
  }

  // Summary table
  console.log('\n── Summary ─────────────────────────────────────────────');
  let failed = 0;
  for (const r of results) {
    console.log(`  ${r.result.padEnd(5)} ${r.name}`);
    if (r.result === 'FAIL') failed++;
  }
  console.log('───────────────────────────────────────────────────────');
  if (failed > 0) {
    console.log(`${failed} step(s) failed — exit 1`);
    process.exit(1);
  }
  console.log('all steps passed');
}

main().catch((err) => {
  console.error('harness crashed:', err);
  process.exit(1);
});
