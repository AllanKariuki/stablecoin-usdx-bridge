import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { KycGate, ServiceTokenClient } from '@damp/nest-platform';
import { IntentsService } from '../src/intents/intents.service';

/**
 * H5: intent creation is the one choke point every direction passes through
 * (DEPOSIT, WITHDRAWAL, TRANSFER — invoice pay creates a TRANSFER), so the
 * KYC gate sits at the top of IntentsService.create, before any write, any
 * core-ledger call or any rail call. These tests assert the refusal happens
 * and that nothing was persisted or proposed downstream of it.
 */

const TIERS = [
  { name: 'TIER_0', rank: 0 },
  { name: 'TIER_1', rank: 1 },
  { name: 'TIER_2', rank: 2 },
];

interface FakeKycState {
  tiers: Record<string, string>;
  status?: number;
}

async function startFakeKyc(state: FakeKycState): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = http.createServer((req, res) => {
    const match = (req.url ?? '').match(/^\/internal\/parties\/([^/]+)\/tier$/);
    const partyId = match ? decodeURIComponent(match[1]) : '';
    const name = state.tiers[partyId] ?? 'TIER_0';
    const body = JSON.stringify({
      partyId,
      tier: { name, rank: TIERS.find((t) => t.name === name)?.rank ?? 0 },
      status: null,
      tiers: TIERS,
    });
    res.writeHead(state.status ?? 200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

interface Harness {
  service: IntentsService;
  intents: { create: jest.Mock; recordRailAccepted: jest.Mock; find: jest.Mock };
  ledger: { ensureWallet: jest.Mock };
  db: { transaction: jest.Mock };
}

function harness(kycUrl: string): Harness {
  const config = {
    get: (key: string) => ({ KYC_URL: kycUrl, KYC_MIN_TIER_FIAT: 'TIER_1' })[key],
  } as unknown as ConfigService;
  const tokens = { accessToken: () => Promise.resolve('tok-svc-payments') };
  const kycGate = new KycGate(config, tokens as unknown as ServiceTokenClient);

  const calls = { transactions: 0, ensured: 0 };
  const createdIntent = {
    id: 'pi_1',
    partyId: 'party_1',
    direction: 'DEPOSIT' as const,
    amount: '100.00',
    currency: 'USD',
    walletId: 'wal_1',
    rail: 'stub',
    railRef: '',
    status: 'REQUIRES_ACTION',
    ledgerTxId: '',
    idempotencyKey: 'key-1',
    description: '',
    failureReason: '',
    metadata: {},
    createdAt: new Date(),
    settledAt: null,
    bankAccountId: null,
    beneficiaryId: null,
    invoiceId: null,
  };
  const intents = {
    create: jest.fn(async () => ({ intent: createdIntent, created: true })),
    recordRailAccepted: jest.fn(async () => undefined),
    find: jest.fn(async () => createdIntent),
  };
  const ledger = {
    ensureWallet: jest.fn(async () => {
      calls.ensured += 1;
      return { id: 'wal_1', user_id: 'party_1', currency: 'USD', chain: '' };
    }),
  };
  const banks = {
    findAccount: jest.fn(async () => null),
    findBeneficiary: jest.fn(async () => null),
    availableBanks: jest.fn(async () => []),
  };
  const rails = {
    get: jest.fn(() => ({
      collect: jest.fn(async () => ({ status: 'REQUIRES_ACTION', railRef: 'rail_1', customerAction: '' })),
      disburse: jest.fn(async () => ({ status: 'REQUIRES_ACTION', railRef: 'rail_1', customerAction: '' })),
    })),
  };
  const db = {
    transaction: jest.fn(async (fn: (q: unknown) => Promise<unknown>) => {
      calls.transactions += 1;
      // The intent and its audit event commit through the same client; the
      // fake answers both.
      return fn({ query: jest.fn(async () => ({ rows: [] })) });
    }),
  };

  const service = new IntentsService(
    intents as never,
    banks as never,
    ledger as never,
    rails as never,
    db as never,
    kycGate,
    config,
  );
  return { service, intents, ledger, db };
}

async function rejection(promise: Promise<unknown>): Promise<{ status: number; code: string } | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    if (err instanceof HttpException) {
      const response = err.getResponse() as { code?: string };
      return { status: err.getStatus(), code: response.code ?? '' };
    }
    throw err;
  }
}

const input = (direction: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER') => ({
  partyId: 'party_1',
  direction,
  amount: '100.00',
  currency: 'USD',
  idempotencyKey: `key-${direction}`,
});

describe('IntentsService KYC gate', () => {
  it('refuses a DEPOSIT below the minimum tier and persists nothing, calls nothing', async () => {
    const kyc = await startFakeKyc({ tiers: { party_1: 'TIER_0' } });
    try {
      const h = harness(kyc.url);
      const err = await rejection(h.service.create(input('DEPOSIT')));
      expect(err?.status).toBe(403);
      expect(err?.code).toBe('KYC_REQUIRED');
      expect(h.db.transaction).not.toHaveBeenCalled();
      expect(h.ledger.ensureWallet).not.toHaveBeenCalled();
    } finally {
      await kyc.close();
    }
  });

  it('refuses a WITHDRAWAL below the minimum tier with nothing persisted', async () => {
    const kyc = await startFakeKyc({ tiers: { party_1: 'TIER_0' } });
    try {
      const h = harness(kyc.url);
      const err = await rejection(h.service.create(input('WITHDRAWAL')));
      expect(err?.status).toBe(403);
      expect(err?.code).toBe('KYC_REQUIRED');
      expect(h.db.transaction).not.toHaveBeenCalled();
      expect(h.ledger.ensureWallet).not.toHaveBeenCalled();
    } finally {
      await kyc.close();
    }
  });

  it('refuses a TRANSFER (the direction invoice pay uses) below the minimum tier', async () => {
    const kyc = await startFakeKyc({ tiers: { party_1: 'TIER_0' } });
    try {
      const h = harness(kyc.url);
      const err = await rejection(h.service.create(input('TRANSFER')));
      expect(err?.status).toBe(403);
      expect(err?.code).toBe('KYC_REQUIRED');
      expect(h.db.transaction).not.toHaveBeenCalled();
      expect(h.ledger.ensureWallet).not.toHaveBeenCalled();
    } finally {
      await kyc.close();
    }
  });

  it('lets a party at the minimum tier through to the normal intent path', async () => {
    const kyc = await startFakeKyc({ tiers: { party_1: 'TIER_1' } });
    try {
      const h = harness(kyc.url);
      const intent = await h.service.create(input('DEPOSIT'));
      expect(intent.id).toBe('pi_1');
      expect(h.db.transaction).toHaveBeenCalled();
      expect(h.ledger.ensureWallet).toHaveBeenCalledWith('party_1', 'USD');
    } finally {
      await kyc.close();
    }
  });

  it('fails closed with 503 KYC_UNAVAILABLE when kyc is unreachable', async () => {
    const kyc = await startFakeKyc({ tiers: {} });
    const url = kyc.url;
    await kyc.close();

    const h = harness(url);
    const err = await rejection(h.service.create(input('DEPOSIT')));
    expect(err?.status).toBe(503);
    expect(err?.code).toBe('KYC_UNAVAILABLE');
    expect(h.db.transaction).not.toHaveBeenCalled();
    expect(h.ledger.ensureWallet).not.toHaveBeenCalled();
  });
});
