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
 * --fast skips the on-chain steps (issuance, bridge, redeem-eth, redeem-sol)
 * and the chain reads, so a run moves fiat only and finishes in ~1 minute.
 * The break-glass step self-skips in --fast: it needs a redemption whose saga
 * is in flight, and creating one is on-chain money. The full run spends
 * testnet funds (Sepolia ETH + devnet SOL) and takes ~45-60 minutes.
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

  --fast             skip the on-chain steps (issuance, bridge, redeem-eth,
                     redeem-sol); break-glass self-skips (no in-flight
                     redemption exists without them)
  --only=step,...    run only the named steps, in order
  --timeout-min=N    saga poll timeout in minutes (default 40)

Steps: wallets, kyc, deposit, p2p, invoice, withdrawal, issuance, bridge,
       redeem-eth, redeem-sol, break-glass, negatives, reconcile`);
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
  admin: 'admin@damp.local',
  compliance: 'compliance@damp.local',
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

// A step can report that it was not applicable rather than that it failed —
// reported as SKIP in the summary and not counted against the run.
class StepSkip extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
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
    if (err instanceof StepSkip) {
      results.push({ name, result: 'SKIP', note: err.reason });
      console.log(`SKIP  ${name}  (${(ms / 1000).toFixed(1)}s)`);
      console.log(`      ${err.reason}`);
      return null;
    }
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

// ---------------------------------------------------------------------------
// Step 1b — kyc (H5: every money step below needs the parties at TIER_1)
// ---------------------------------------------------------------------------

// Keycloak admin API (dev bootstrap credentials from docker-compose.yaml;
// overridable so a differently-provisioned realm still works).
const KC_ADMIN_BASE = process.env.E2E_KC_ADMIN_BASE || 'http://localhost:8080';
const KC_ADMIN_USER = process.env.E2E_KC_ADMIN_USER || 'admin';
const KC_ADMIN_PASSWORD = process.env.E2E_KC_ADMIN_PASSWORD || 'admin';

async function kcAdminToken() {
  const res = await fetch(`${KC_ADMIN_BASE}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: KC_ADMIN_USER,
      password: KC_ADMIN_PASSWORD,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new StepError(`Keycloak admin login failed (${res.status})`, { status: res.status, body });
  }
  return body.access_token;
}

// One throwaway customer token, outside the realm-file cache: the user is
// created at runtime and deleted before the step returns.
async function throwawayToken(username, password) {
  const res = await fetch(KEYCLOAK_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: KC_CLIENT_ID,
      username,
      password,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new StepError(`token for throwaway ${username} failed (${res.status})`, { status: res.status, body });
  }
  return body.access_token;
}

async function kycStatus(user) {
  const r = await api(user, 'GET', '/kyc/status');
  assert(r.status === 200, `GET /kyc/status as ${user} -> ${r.status}`, { status: r.status, body: r.body });
  return r.body;
}

/**
 * Brings one party to TIER_1 through the REAL product path: open a case,
 * request presigned upload slots, upload each required document (MinIO when
 * kyc has S3 credentials; the documented unconfigured-storage stub otherwise
 * — the upload URL is null and the storage key is recorded without a file),
 * submit, let the stub screen (CLEAR for @damp.local), then approve the
 * maker-checker request as compliance@damp.local through the gateway and
 * wait for workflow's callback to grant the tier. Idempotent: a party
 * already at/above TIER_1 passes immediately, and an open case mid-flight is
 * resumed rather than re-opened.
 */
async function bringToTier(user) {
  let st = await kycStatus(user);
  if ((st.tierRank ?? 0) >= 1) return 'already at tier';

  let caseId = st.openCase?.id;
  let caseStatus = st.openCase?.status ?? '';
  if (!caseId) {
    const created = await api(user, 'POST', '/kyc/cases', { tier: 'TIER_1' });
    if (created.status === 409) {
      const again = await kycStatus(user);
      caseId = again.openCase?.id;
      caseStatus = again.openCase?.status ?? '';
    } else {
      assert(created.status >= 200 && created.status < 300 && created.body?.id,
        `kyc case open as ${user} -> ${created.status}`, { status: created.status, body: created.body });
      caseId = created.body.id;
      caseStatus = created.body.status;
    }
  }
  assert(caseId, `no open KYC case for ${user}`, { body: st });

  if (caseStatus === 'DRAFT') {
    const tiersRes = await api(user, 'GET', '/kyc/tiers');
    assert(tiersRes.status === 200, `GET /kyc/tiers as ${user} -> ${tiersRes.status}`, { status: tiersRes.status });
    const tier1 = tiersRes.body.tiers?.find((t) => t.name === 'TIER_1');
    assert(tier1?.requiredDocuments, 'TIER_1 not found in /kyc/tiers', { body: tiersRes.body });

    for (const kind of tier1.requiredDocuments) {
      const slot = await api(user, 'POST', `/kyc/cases/${caseId}/documents/upload-url`, {
        kind,
        contentType: 'application/pdf',
      });
      assert(slot.status === 200 && slot.body?.storageKey,
        `upload slot for ${kind} -> ${slot.status}`, { status: slot.status, body: slot.body });

      const bytes = Buffer.from('%PDF-1.4 e2e stub document\n');
      if (slot.body.uploadUrl) {
        const put = await fetch(slot.body.uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': 'application/pdf' },
          body: bytes,
        });
        assert(put.ok, `document PUT to storage -> ${put.status}`);
      }

      const recorded = await api(user, 'POST', `/kyc/cases/${caseId}/documents`, {
        kind,
        storageKey: slot.body.storageKey,
        contentType: 'application/pdf',
        sizeBytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      });
      assert(recorded.status >= 200 && recorded.status < 300,
        `document record for ${kind} -> ${recorded.status}`, { status: recorded.status, body: recorded.body });
    }

    const submitted = await api(user, 'POST', `/kyc/cases/${caseId}/submit`, {
      email: user,
      fullName: `E2E ${user}`,
      country: 'KE',
    });
    assert(submitted.status >= 200 && submitted.status < 300,
      `kyc submit as ${user} -> ${submitted.status}`, { status: submitted.status, body: submitted.body });
    caseStatus = submitted.body?.status;
  }

  // @damp.local screens CLEAR, which skips the review queue but not
  // maker-checker: the case goes straight to PENDING_APPROVAL.
  const awaiting = await poll(
    () => kycStatus(user),
    (s) => ['PENDING_APPROVAL'].includes(s.openCase?.status) || (s.tierRank ?? 0) >= 1 || !['DRAFT', 'SUBMITTED', 'SCREENING', 'PENDING_REVIEW'].includes(s.openCase?.status),
    60_000,
    1_000,
    `kyc screening ${caseId}`,
  );
  if ((awaiting.tierRank ?? 0) >= 1) return 'approved without a queue stop';
  assert(awaiting.openCase?.status === 'PENDING_APPROVAL',
    `kyc case ${caseId} is ${awaiting.openCase?.status}, expected PENDING_APPROVAL`, { body: awaiting });

  const list = await api(USERS.compliance, 'GET', `/approval-requests?subjectType=KYC_CASE&subjectId=${caseId}`);
  assert(list.status === 200 && Array.isArray(list.body?.requests),
    `approval request list -> ${list.status}`, { status: list.status, body: list.body });
  const request0 = list.body.requests[0];
  assert(request0?.id, `no approval request for KYC case ${caseId}`, { body: list.body });

  if (request0.status === 'PENDING') {
    const approved = await api(USERS.compliance, 'POST', `/approval-requests/${request0.id}/approve`, {
      comment: ref('e2e KYC approval'),
    });
    assert(approved.status === 200, `kyc approval -> ${approved.status}`, { status: approved.status, body: approved.body });
  }

  // workflow delivers the decision to kyc asynchronously; the tier grant and
  // the wallet thaw land together.
  const granted = await poll(
    () => kycStatus(user),
    (s) => (s.tierRank ?? 0) >= 1,
    90_000,
    1_000,
    `kyc tier grant ${caseId}`,
  );
  assert((granted.tierRank ?? 0) >= 1, `tier was never granted to ${user}`, { body: granted });
  return `granted ${granted.tier} (rank ${granted.tierRank})`;
}

/**
 * The H5 negative: a party nobody has screened can move no money.
 *
 * A throwaway user is created through the Keycloak admin API (explicitly
 * granted the `customer` realm role rather than trusting default-role
 * assignment), logs in via ROPC, and identity JIT-provisions its party on
 * the first gateway call. Its tier is TIER_0 by construction — so a deposit
 * intent (payments' gate), an issuance and a customer transfer (bff's gate)
 * must all answer 403 KYC_REQUIRED before anything is written. The user is
 * deleted at the end; the provisioned party row is a harmless remnant.
 */
async function kycNegative() {
  const token = await kcAdminToken();
  const username = `kyc-neg-${runId}`;
  const email = `${username}@damp.local`;
  const password = 'damp-dev-only';

  const created = await fetch(`${KC_ADMIN_BASE}/admin/realms/damp/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      username,
      email,
      // Keycloak 26's user profile requires first/last name; without them
      // the account is "not fully set up" and the password grant is refused.
      firstName: 'KYC',
      lastName: 'Negative',
      enabled: true,
      emailVerified: true,
      requiredActions: [],
      credentials: [{ type: 'password', value: password, temporary: false }],
    }),
  });
  assert(created.status === 201, `Keycloak user create -> ${created.status}`, { status: created.status });
  const location = created.headers.get('location') ?? '';
  const userId = location.split('/').pop();
  assert(userId, 'user create carried no Location header');

  try {
    const role = await fetch(`${KC_ADMIN_BASE}/admin/realms/damp/roles/customer`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const roleRep = await role.json();
    const assigned = await fetch(`${KC_ADMIN_BASE}/admin/realms/damp/users/${userId}/role-mappings/realm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify([roleRep]),
    });
    assert(assigned.status === 204, `customer role assign -> ${assigned.status}`, { status: assigned.status });

    const userToken = await throwawayToken(username, password);

    // First gateway call: auth-proxy resolves the subject and identity
    // JIT-provisions the party (and its default wallet).
    const wallets = await api(null, 'GET', '/wallets', undefined, { auth: userToken });
    assert(wallets.status === 200, `throwaway GET /wallets -> ${wallets.status}`, { status: wallets.status, body: wallets.body });

    const deposit = await api(null, 'POST', '/payment-intents', {
      direction: 'DEPOSIT',
      amount: '1.00',
      currency: 'USD',
    }, { auth: userToken });
    assert(deposit.status === 403 && deposit.body?.code === 'KYC_REQUIRED',
      `unverified deposit intent -> ${deposit.status} ${deposit.body?.code}, want 403 KYC_REQUIRED`,
      { status: deposit.status, body: deposit.body });

    const issuance = await api(null, 'POST', '/issuances', {
      fiatWalletId: 'not-mine',
      usdxWalletId: 'not-mine',
      amount: '1.00',
    }, { auth: userToken });
    assert(issuance.status === 403 && issuance.body?.code === 'KYC_REQUIRED',
      `unverified issuance -> ${issuance.status} ${issuance.body?.code}, want 403 KYC_REQUIRED`,
      { status: issuance.status, body: issuance.body });

    const transfer = await api(null, 'POST', '/transfers', {
      fromWalletId: 'not-mine',
      toWalletId: 'not-theirs',
      amount: '1.00',
    }, { auth: userToken });
    assert(transfer.status === 403 && transfer.body?.code === 'KYC_REQUIRED',
      `unverified transfer -> ${transfer.status} ${transfer.body?.code}, want 403 KYC_REQUIRED`,
      { status: transfer.status, body: transfer.body });
  } finally {
    await fetch(`${KC_ADMIN_BASE}/admin/realms/damp/users/${userId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
  }
  return true;
}

async function stepKyc() {
  const notes = [];
  for (const user of [USERS.customer, USERS.company]) {
    notes.push(`${user}: ${await bringToTier(user)}`);
  }
  await kycNegative();
  return { note: notes.join('; ') + '; unverified party refused 403 KYC_REQUIRED (deposit intent, issuance, transfer)' };
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

// Resolve the customer's wallets from the API. The redeem steps use this
// instead of ctx.customer so each can run standalone via --only=...
async function customerWallets() {
  const w = (await api(USERS.customer, 'GET', '/wallets')).body;
  assert(Array.isArray(w), 'customer GET /wallets did not return an array', { body: w });
  return {
    usd: w.find((x) => x.currency === 'USD' && !x.chain),
    usdxEth: w.find((x) => x.currency === 'USDX' && x.chain === 'ETHEREUM'),
    usdxSol: w.find((x) => x.currency === 'USDX' && x.chain === 'SOLANA'),
  };
}

// --- Stub-rail fiat accounting (Leg C expectation) ---------------------------
//
// Leg C compares the custodian's reported bank balance against GL 1100.USD
// ("Cash at custodian", chart.go GLTrustBank) — the figure the reconcile run
// row carries as ledger_cash. On this stack the custodian is a stub that
// mirrors core-ledger's cash position on a poll (services/rms
// StubCustodianProvider), while payments' stub rail posts to that same GL on
// every run: a settled deposit debits it for the full amount (flows.go
// Deposit), a settled withdrawal credits it for the net after fee (flows.go
// Withdraw). Issuance and redemption do not touch it — they re-shape the
// claim into reserve backing and never move cash (flows.go Issue/Redeem) — and
// p2p/invoice transfers only move liabilities.
//
// So the run's net stub-rail fiat is exactly how far ledger_cash should move,
// and — until the next custodian poll re-syncs the stub — exactly how much
// Leg C is expected to fall short of the last reported bank balance. That is
// Leg C working, not a posting bug.

const railFiat = []; // [{ direction, units }] for settled stub-rail intents this run created

function recordRailFiat(direction, currency, magnitude) {
  // Leg C reconciles ledger.PegCurrency (USD) only; a non-USD rail intent is
  // not the GL this check reads.
  if (currency !== 'USD') return;
  railFiat.push({ direction, units: magnitude });
}

function expectedCustodianCashMovement() {
  let v = 0n;
  for (const r of railFiat) v += r.direction === 'DEPOSIT' ? r.units : -r.units;
  return v;
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

  // A deposit debits GL 1100.USD by the full amount, which is exactly the
  // credit the customer's wallet just took.
  recordRailFiat('DEPOSIT', 'USD', diffUnits(after, before, 'USD'));

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

  // A withdrawal credits GL 1100.USD the *net* after fee (flows.go Withdraw).
  // FEE_WITHDRAWAL_BPS is 0 on this stack, so the customer's gross debit is
  // the cash that leaves the custodian.
  recordRailFiat('WITHDRAWAL', 'USD', -diffUnits(after, before, 'USD'));

  await invariants();

  return { ids: { bankId: bank.id, bankAccountId: acct.body.id, withdrawalIntentId: intentId, withdrawalLedgerTxId: intent.body.ledgerTxId } };
}

// ---------------------------------------------------------------------------
// Steps 6-9 — on-chain (skipped with --fast)
// ---------------------------------------------------------------------------

async function sagaPoll(correlationId, kind, timeoutMs) {
  return poll(
    () => api(USERS.customer, 'GET', `/transfers/${correlationId}`),
    // A 502/503/504 from the gateway is a transient read failure, not the
    // saga's answer: keep polling. Any other non-200 ends the poll.
    (r) => (r.status !== 200 && ![502, 503, 504].includes(r.status)) || ['COMPLETED', 'FAILED', 'COMPENSATED'].includes(r.body?.status),
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

const REDEEM_AMOUNT = '10.00';
const REDEEM_UNITS = 10_000_000n; // 10.00 USD-X at 6 decimals

// Shared request + saga wait. Each redeem step takes its own supply and
// wallet snapshots around this call.
async function submitRedemption(label, usdxWalletId, fiatWalletId, amount) {
  const r = await api(USERS.customer, 'POST', '/redemptions', {
    usdxWalletId,
    fiatWalletId,
    amount,
  });
  assert(r.status === 202, `${label} redemption -> ${r.status}`, { status: r.status, body: r.body });
  const t = await sagaPoll(r.body.correlationId, `${label} redeem`, opts.timeoutMin * 60_000);
  assert(t.body?.status === 'COMPLETED', `${label} redeem saga ${t.body?.status}: ${t.body?.lastError}`, { status: t.status, body: t.body });
  return { correlationId: r.body.correlationId, saga: t.body };
}

async function stepRedeemEth() {
  // Resolved from the API, not ctx, so --only=redeem-eth runs standalone.
  const wallets = await customerWallets();
  assert(wallets.usd?.id, 'no customer USD fiat wallet');
  assert(wallets.usdxEth?.id, 'no customer USD-X ETHEREUM wallet (run the wallets step first)');

  const walletBefore = await walletBalance(wallets.usdxEth.id, USERS.customer);
  assert(units(walletBefore, 'USDX') >= REDEEM_UNITS,
    `customer ETH USD-X balance ${walletBefore} is below the redemption amount ${REDEEM_AMOUNT} — run the issuance step (or bridge from Solana) to fund it first`,
    { body: { walletId: wallets.usdxEth.id, balance: walletBefore } });

  const fiatBefore = await walletBalance(wallets.usd.id, USERS.customer);
  const ethBefore = readEthTotalSupply();

  const { correlationId, saga } = await submitRedemption('eth', wallets.usdxEth.id, wallets.usd.id, REDEEM_AMOUNT);

  const ethAfter = readEthTotalSupply();
  const ethDec = readEthDecimals();
  assert(ethAfter - ethBefore === -(10n * 10n ** BigInt(ethDec)), `ETH supply delta ${ethAfter - ethBefore}, expected -10 * 10^${ethDec}`);

  const walletAfter = await walletBalance(wallets.usdxEth.id, USERS.customer);
  assert(diffUnits(walletAfter, walletBefore, 'USDX') === -REDEEM_UNITS,
    `ETH USD-X wallet moved ${fmtUnits(diffUnits(walletAfter, walletBefore, 'USDX'), 'USDX')}, expected -${REDEEM_AMOUNT}`);

  const fiatAfter = await walletBalance(wallets.usd.id, USERS.customer);
  assert(diffUnits(fiatAfter, fiatBefore, 'USD') === 1000n,
    `fiat moved ${fmtUnits(diffUnits(fiatAfter, fiatBefore, 'USD'), 'USD')}, expected +${REDEEM_AMOUNT}`);

  await invariants();

  const hash = saga.sourceTxHash || saga.destTxHash;
  const url = saga.sourceTxUrl || saga.destTxUrl;
  return { ids: { ethRedeemCorrelationId: correlationId, ethRedeemTxHash: hash, ethRedeemExplorerUrl: url }, note: `tx ${hash} ${url || ''}` };
}

async function stepRedeemSol() {
  // Resolved from the API, not ctx, so --only=redeem-sol runs standalone.
  const wallets = await customerWallets();
  const solWallet = wallets.usdxSol;
  const solBalance = solWallet?.id ? await walletBalance(solWallet.id, USERS.customer) : '0.00';

  // Only the bridge step puts USD-X on Solana. If it did not complete there
  // is nothing to burn, which is a skip — not a failure of this run.
  if (!solWallet?.id || units(solBalance, 'USDX') < REDEEM_UNITS) {
    throw new StepSkip(`bridge step did not complete — customer holds ${solBalance} Solana USD-X, below the redemption amount ${REDEEM_AMOUNT}`);
  }
  assert(wallets.usd?.id, 'no customer USD fiat wallet');

  const fiatBefore = await walletBalance(wallets.usd.id, USERS.customer);
  const solBefore = await readSolSupply();

  const { correlationId, saga } = await submitRedemption('sol', solWallet.id, wallets.usd.id, REDEEM_AMOUNT);

  const solAfter = await readSolSupply();
  assert(solAfter.amount - solBefore.amount === -(10n * 10n ** BigInt(solAfter.decimals)),
    `Solana supply delta ${solAfter.amount - solBefore.amount}, expected -10 * 10^${solAfter.decimals}`);

  const walletAfter = await walletBalance(solWallet.id, USERS.customer);
  assert(diffUnits(walletAfter, solBalance, 'USDX') === -REDEEM_UNITS,
    `SOL USD-X wallet moved ${fmtUnits(diffUnits(walletAfter, solBalance, 'USDX'), 'USDX')}, expected -${REDEEM_AMOUNT}`);

  const fiatAfter = await walletBalance(wallets.usd.id, USERS.customer);
  assert(diffUnits(fiatAfter, fiatBefore, 'USD') === 1000n,
    `fiat moved ${fmtUnits(diffUnits(fiatAfter, fiatBefore, 'USD'), 'USD')}, expected +${REDEEM_AMOUNT}`);

  await invariants();

  const hash = saga.sourceTxHash || saga.destTxHash;
  const url = saga.sourceTxUrl || saga.destTxUrl;
  return { ids: { solRedeemCorrelationId: correlationId, solRedeemTxHash: hash, solRedeemExplorerUrl: url }, note: `tx ${hash} ${url || ''}` };
}

// ---------------------------------------------------------------------------
// Step 9b — break-glass (always attempted; skipped without a target)
// ---------------------------------------------------------------------------

const BREAK_GLASS_AMOUNT = '5.00';
const BREAK_GLASS_UNITS = 5_000_000n; // 5.00 USD-X at 6 decimals

/**
 * H4's break-glass maker-checker, exercised on the NEGATIVE path only: the
 * proposal must never settle on an operator's word.
 *
 * Full mode creates a small fresh redemption (its saga is in flight for
 * minutes while the burn reaches finality, so nothing races), then:
 *
 *  1. treasury proposes break-glass with a random fake hash -> 202
 *     PENDING_APPROVAL (and nothing settles);
 *  2. treasury cannot approve its own request -> workflow 403
 *     (excludeInitiator);
 *  3. admin approves -> the burn cannot verify -> VERIFICATION_FAILED;
 *  4. the saga is NOT settled and the fiat wallet did not move.
 *
 * --fast has no gateway route to list pending redemptions (the dead-letter
 * queue is not exposed through the gateway) and creating one is chain
 * money, so it skips with a reason.
 */
async function stepBreakGlass() {
  if (opts.fast) {
    throw new StepSkip(
      '--fast: a break-glass target needs a redemption whose saga is in flight, and creating one is on-chain money; run the full flow instead',
    );
  }

  const wallets = await customerWallets();
  assert(wallets.usd?.id, 'no customer USD fiat wallet');
  assert(wallets.usdxEth?.id, 'no customer USD-X ETHEREUM wallet (run the wallets step first)');

  const usdxBefore = await walletBalance(wallets.usdxEth.id, USERS.customer);
  if (units(usdxBefore, 'USDX') < BREAK_GLASS_UNITS) {
    throw new StepSkip(
      `customer ETH USD-X balance ${usdxBefore} is below the break-glass amount ${BREAK_GLASS_AMOUNT} — run the issuance step first`,
    );
  }

  const fiatBefore = await walletBalance(wallets.usd.id, USERS.customer);

  // A fresh redemption whose saga is in flight. The worker will eventually
  // burn it for real (that is the happy path); break-glass below proves it
  // cannot be settled by hand first.
  const r = await api(USERS.customer, 'POST', '/redemptions', {
    usdxWalletId: wallets.usdxEth.id,
    fiatWalletId: wallets.usd.id,
    amount: BREAK_GLASS_AMOUNT,
  });
  assert(r.status === 202, `break-glass redemption -> ${r.status}`, { status: r.status, body: r.body });
  const redeemTxId = r.body.transaction?.id;
  assert(redeemTxId, 'redemption response carries no transaction id', { status: r.status, body: r.body });
  const correlationId = r.body.correlationId;

  // Operator A (treasury) proposes break-glass with a hash the chain has
  // never seen.
  const fakeHash = '0x' + crypto.randomBytes(32).toString('hex');
  const prop = await api(USERS.treasury, 'POST', `/redemptions/${redeemTxId}/confirm`, {
    chain_tx_hash: fakeHash,
    reason: ref('e2e break-glass negative path'),
  });
  assert(prop.status === 202 && prop.body?.status === 'PENDING_APPROVAL',
    `break-glass proposal -> ${prop.status}`, { status: prop.status, body: prop.body });
  const approvalRequestId = prop.body?.approval_request_id;
  assert(approvalRequestId, 'proposal carries no approval_request_id', { body: prop.body });

  // The saga must not be settled by the proposal alone.
  const midSaga = await api(USERS.customer, 'GET', `/transfers/${correlationId}`);
  assert(midSaga.status === 200 && midSaga.body?.status !== 'COMPLETED',
    `the proposal settled the saga (${midSaga.body?.status}); a break-glass must not settle without approval`, { body: midSaga.body });

  // Operator A cannot approve their own request — workflow's excludeInitiator.
  const self = await api(USERS.treasury, 'POST', `/approval-requests/${approvalRequestId}/approve`, { comment: 'self-approval attempt' });
  assert(self.status === 403, `self-approval -> ${self.status}, want 403`, { status: self.status, body: self.body });

  // Operator B (a different person — admin, who also holds approvals:decide)
  // approves. The burn cannot verify: the hash is fake.
  const approval = await api(USERS.admin, 'POST', `/approval-requests/${approvalRequestId}/approve`, { comment: ref('e2e negative approval') });
  assert(approval.status === 200, `admin approve -> ${approval.status}`, { status: approval.status, body: approval.body });

  // The decision callback is delivered asynchronously (workflow's drain
  // loop); poll the proposal row to a terminal state.
  const final = await poll(
    () => api(USERS.treasury, 'GET', `/redemptions/${redeemTxId}/break-glass`),
    (res) => res.status === 200 && res.body?.status !== 'PENDING',
    90_000, 2_000, 'break-glass status',
  );
  assert(final.body?.status === 'VERIFICATION_FAILED',
    `break-glass status ${final.body?.status}, want VERIFICATION_FAILED`, { status: final.status, body: final.body });
  assert(final.body?.failure_reason, 'VERIFICATION_FAILED carries no failure_reason', { body: final.body });

  // The approval moved nothing: the saga is still in flight and the fiat
  // wallet is untouched.
  const saga = await api(USERS.customer, 'GET', `/transfers/${correlationId}`);
  assert(saga.status === 200 && saga.body?.status !== 'COMPLETED',
    `the saga is ${saga.body?.status}; a failed verification must not settle it`, { status: saga.status, body: saga.body });
  const fiatAfter = await walletBalance(wallets.usd.id, USERS.customer);
  assert(units(fiatAfter, 'USD') === units(fiatBefore, 'USD'),
    `fiat moved from ${fiatBefore} to ${fiatAfter} on a failed verification`);

  // The status route is operator-only.
  const asCustomer = await api(USERS.customer, 'GET', `/redemptions/${redeemTxId}/break-glass`);
  assert(asCustomer.status === 403, `customer break-glass read -> ${asCustomer.status}, want 403`, { status: asCustomer.status });

  await invariants();

  return {
    ids: { breakGlassRedeemTxId: redeemTxId, breakGlassApprovalRequestId: approvalRequestId },
    note: `negative path passed: ${final.body.failure_reason}; the worker still settles this redemption the ordinary way (real burn of ${BREAK_GLASS_AMOUNT})`,
  };
}

// ---------------------------------------------------------------------------
// Step 10 — negative checks (always run)
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

  // (g) core-ledger's own auth boundary (H2). The API port is reachable
  // from the host, so the check is direct: without a service-account token
  // it must 401, and a customer's gateway token — right issuer, wrong
  // audience — must 401 too. Neither may reach the posting engine.
  {
    const CORE_LEDGER = process.env.E2E_CORE_LEDGER || 'http://localhost:18081';
    const deposit = { wallet_id: ctx.customer.usd.id, amount: '1.00' };

    const r1 = await fetch(`${CORE_LEDGER}/deposits`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(deposit),
    });
    all &= subcheck('direct core-ledger POST /deposits without token → 401', r1.status === 401, `status ${r1.status}`);

    const customerToken = await bearer(USERS.customer);
    const r2 = await fetch(`${CORE_LEDGER}/deposits`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${customerToken}` },
      body: JSON.stringify(deposit),
    });
    all &= subcheck('direct core-ledger POST /deposits with customer token (wrong audience) → 401', r2.status === 401, `status ${r2.status}`);
  }

  // (h) the H3 boundaries on the other services. Same idea as (g): the
  // service ports are reachable from the host, so a forged X-User-Id without
  // a service token must 401 on a user-facing route, an ingest route must
  // refuse a caller with no token, and a caller's OWN token against another
  // service (right issuer, wrong audience) must 401 — none of these may
  // reach a handler.
  {
    const PAYMENTS = process.env.E2E_PAYMENTS || 'http://localhost:13003';
    const NOTIFICATIONS = process.env.E2E_NOTIFICATIONS || 'http://localhost:13000';

    const forged = await fetch(`${PAYMENTS}/payment-intents`, {
      method: 'GET',
      headers: { 'x-user-id': 'forged-party' },
    });
    all &= subcheck('direct payments GET /payment-intents with forged X-User-Id and no token → 401', forged.status === 401, `status ${forged.status}`);

    const ingest = await fetch(`${NOTIFICATIONS}/internal/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'e2e.forged', partyId: ctx.customer.partyId, payload: {} }),
    });
    all &= subcheck('direct notifications POST /internal/events without token → 401', ingest.status === 401, `status ${ingest.status}`);

    // svc-payments' own token against payments: the token's audiences are
    // core-ledger/notifications/audit-trail — payments is not one of them,
    // so the verifier rejects it as wrong-audience 401.
    const mintRes = await fetch(`${process.env.KEYCLOAK_BASE_URL ?? 'http://localhost:8080'}/realms/damp/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'svc-payments',
        client_secret: process.env.E2E_SVC_PAYMENTS_SECRET ?? 'dev-svc-payments-secret',
      }),
    });
    let wrongAudience = 401;
    if (mintRes.ok) {
      const { access_token } = await mintRes.json();
      const r = await fetch(`${PAYMENTS}/payment-intents`, {
        method: 'GET',
        headers: { authorization: `Bearer ${access_token}`, 'x-user-id': 'forged-party' },
      });
      wrongAudience = r.status;
    }
    all &= subcheck('direct payments with svc-payments token (wrong audience) → 401', wrongAudience === 401, `status ${wrongAudience}`);
  }

  assert(all, 'one or more negative checks failed');
  return { note: 'all negative checks passed' };
}

// ---------------------------------------------------------------------------
// Step 11 — reconciliation
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
  let ledgerCash = null;
  for (const line of String(log).split('\n')) {
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.msg === 'reconciliation OK') { ok = true; ledgerCash = o.ledger_cash ?? null; }
    else if (o.msg === 'reconciliation found breaks') breaks = true;
    else if (o.msg === 'reconciliation could not be performed') errored = true;
    else if (o.msg === 'reconciliation break') legs[o.leg] = { code: o.code, drift: o.drift, detail: o.detail };
    else if (o.msg === 'Leg C skipped: no custodian has reported a balance yet') legs.LEG_C = { skipped: true };
  }
  return { ok, breaks, errored, legs, ledgerCash };
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
    // Leg C's two terms come straight off the run row (renderRun in
    // core-ledger/internal/api/reserves.go), still in smallest units. The bank
    // balance is null when no custodian has reported one yet.
    bankBalance: bigOrNull(run.bank_balance),
    ledgerCash: bigOrNull(run.ledger_cash),
    bankAsOf: run.bank_as_of ?? null,
    legAOk: run.leg_a_ok, legBOk: run.leg_b_ok, legCOk: run.leg_c_ok,
    status: run.status, id: run.id, source: 'http',
  };
}

// The log fallback has no structured Leg C row, but a Leg C break line carries
// the leg's own Detail() string — `shortfall=... bank_balance=... (as_of=...)
// ledger_cash=...` (reconciliation/legs.go) — and a healthy run logs
// ledger_cash on its "reconciliation OK" line.
function parseLegCDetail(detail) {
  const m = String(detail ?? '').match(/shortfall=(-?\d+) bank_balance=(-?\d+) \(as_of=([^)]*)\) ledger_cash=(-?\d+)/);
  if (!m) return { bankBalance: null, ledgerCash: null };
  return { bankBalance: BigInt(m[2]), ledgerCash: BigInt(m[4]) };
}

function snapshotFromLog(log) {
  const sum = summarizeReconcile(log);
  const legCBreak = sum.legs.LEG_C && !sum.legs.LEG_C.skipped ? sum.legs.LEG_C : null;
  const cash = legCBreak ? parseLegCDetail(legCBreak.detail) : { bankBalance: null, ledgerCash: null };
  return {
    drift: sum.legs.LEG_A?.drift != null ? BigInt(sum.legs.LEG_A.drift) : 0n,
    issued: null, inTransit: null, eth: null, sol: null,
    bankBalance: cash.bankBalance,
    ledgerCash: cash.ledgerCash ?? (sum.ledgerCash !== null ? BigInt(sum.ledgerCash) : null),
    bankAsOf: null,
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

  // Leg B is the 1:1 peg; it must be ok. Leg C is evaluated by delta below:
  // a custodian shortfall that grows by exactly this run's stub-rail fiat is
  // the stub custodian, not a product failure.
  assert(after.legBOk === true, `Leg B is not ok (leg_b_ok=${after.legBOk})`, { status: after.status, id: after.id });

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

  // ---- Leg C: ledger cash vs the custodian's reported balance ---------------
  //
  // Leg C is an inequality (bank >= ledger cash) against a *stub* custodian
  // that mirrors ledger cash on a 60s poll while the stub rail moves GL
  // 1100.USD on every run. So the run's job is not "is there a shortfall" —
  // until the next poll the ledger has moved and the last reported balance has
  // not, correctly — it is "did the ledger cash move by exactly what the rail
  // said it would". A different number is a posting bug.
  const expectedCash = expectedCustodianCashMovement();
  const expectedTerms = `${expectedCash >= 0n ? '+' : ''}${expectedCash}`;
  const railTerms = railFiat.length
    ? railFiat.map((r) => `${r.direction === 'DEPOSIT' ? '+' : '-'}${r.units} ${r.direction.toLowerCase()}`).join(', ')
    : 'none';
  const hasCash = (s) => s !== null && s !== undefined && s.bankBalance !== null && s.ledgerCash !== null;
  const cashTerms = (s) => (hasCash(s)
    ? `bank_balance=${s.bankBalance} (as_of=${s.bankAsOf ?? '?'}) ledger_cash=${s.ledgerCash}`
    : 'bank_balance=? ledger_cash=?');

  if (hasCash(before)) console.log(`  Leg C  before ${cashTerms(before)}`);
  console.log(`  Leg C  after  ${cashTerms(after)}`);

  let cashDeltaActual = null;
  if (after.legCOk === null) {
    console.log(`  Leg C  skipped (no custodian snapshot) — nothing to compare; stub rail moved ${expectedTerms} (${railTerms})`);
  } else if (!hasCash(before) || !hasCash(after)) {
    console.log(`  Leg C  ${describeLeg('LegC', after.legCOk)}; cash terms unavailable on one side — skipped the delta comparison (stub rail moved ${expectedTerms}: ${railTerms})`);
    if (before?.legCOk === false || after.legCOk === false) {
      console.log('  KNOWN: stub custodian; shortfall grows by net stub fiat (stub balance lags the ledger by up to one poll)');
    }
  } else {
    const bankDelta = after.bankBalance - before.bankBalance;
    const cashDelta = after.ledgerCash - before.ledgerCash;
    cashDeltaActual = cashDelta;
    console.log(`  Leg C  delta  bank_balance=${bankDelta} ledger_cash=${cashDelta}  expected ledger_cash=${expectedTerms}  (stub rail: ${railTerms})`);

    // The stub custodian is a mirror, not a constant: services/rms's
    // StubCustodianProvider reports the ledger's own cash position plus its
    // configured drift, re-polled every CUSTODIAN_POLL_SECONDS (60s). So a
    // bank_balance move is only legitimate when a *new snapshot* was posted
    // (bank_as_of advanced) — that is the stub re-syncing to cash this run
    // moved. A figure that changed with no new snapshot moved underneath us.
    const repolled = before.bankAsOf !== null && after.bankAsOf !== null && after.bankAsOf !== before.bankAsOf;
    if (bankDelta !== 0n && repolled) {
      console.log(`  Leg C  bank_balance re-polled during the run (as_of ${before.bankAsOf} -> ${after.bankAsOf}) — stub custodian mirrors ledger cash`);
    }

    // A stub custodian's balance lags by up to one poll, so the whole expected
    // change in Leg C's drift is the ledger-cash movement. Say so out loud
    // rather than letting a red leg look like a failure of this run.
    if (before.legCOk === false || after.legCOk === false) {
      console.log(`  KNOWN: stub custodian; shortfall grows by net stub fiat (LegC before=${describeLeg('LegC', before.legCOk)} after=${describeLeg('LegC', after.legCOk)})`);
    }

    assert(bankDelta === 0n || repolled,
      `Leg C bank_balance changed during the run with no new custodian snapshot: before=${before.bankBalance} (as_of=${before.bankAsOf ?? '?'}) after=${after.bankBalance} (as_of=${after.bankAsOf ?? '?'})`,
      { before: cashTerms(before), after: cashTerms(after) });
    assert(cashDelta === expectedCash,
      `Leg C ledger_cash moved ${cashDelta}, expected ${expectedTerms} from the run's stub-rail fiat (${railTerms}) — a mismatch here is a posting bug, not stub drift`,
      { before: cashTerms(before), after: cashTerms(after), railFiat });
  }

  return {
    ids: after.id ? { reconciliationRunId: after.id } : undefined,
    note: `reconcile exit=${after.exitCode} status=${after.status} ${legs} legC cash delta expected=${expectedTerms} actual=${cashDeltaActual ?? '?'}`,
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const STEPS = [
  { name: 'wallets', fn: stepWallets, money: false, onchain: false },
  { name: 'kyc', fn: stepKyc, money: false, onchain: false },
  { name: 'deposit', fn: stepDeposit, money: true, onchain: false },
  { name: 'p2p', fn: stepP2p, money: true, onchain: false },
  { name: 'invoice', fn: stepInvoice, money: true, onchain: false },
  { name: 'withdrawal', fn: stepWithdrawal, money: true, onchain: false },
  { name: 'issuance', fn: stepIssuance, money: true, onchain: true },
  { name: 'bridge', fn: stepBridge, money: true, onchain: true },
  { name: 'redeem-eth', fn: stepRedeemEth, money: true, onchain: true },
  { name: 'redeem-sol', fn: stepRedeemSol, money: true, onchain: true },
  { name: 'break-glass', fn: stepBreakGlass, money: false, onchain: false },
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
