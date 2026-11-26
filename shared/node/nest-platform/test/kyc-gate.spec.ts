import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { KycGate } from '../src';

/**
 * H5's money-path gate: below the minimum tier -> 403 KYC_REQUIRED, at or
 * above -> pass, and every way kyc can fail to answer -> 503 KYC_UNAVAILABLE
 * (fail closed — an uncheckable tier must stop money, not wave it through).
 */

const TIERS = [
  { name: 'TIER_0', rank: 0 },
  { name: 'TIER_1', rank: 1 },
  { name: 'TIER_2', rank: 2 },
];

interface FakeKycState {
  /** partyId -> tier name; unknown parties answer TIER_0 (rank 0). */
  tiers: Record<string, string>;
  /** HTTP status to answer with (default 200). */
  status?: number;
}

async function startFakeKyc(state: FakeKycState): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = http.createServer((req, res) => {
    const match = (req.url ?? '').match(/^\/internal\/parties\/([^/]+)\/tier$/);
    const partyId = match ? decodeURIComponent(match[1]) : '';
    const name = state.tiers[partyId] ?? 'TIER_0';
    const status = state.status ?? 200;
    const body = JSON.stringify({
      partyId,
      tier: { name, rank: TIERS.find((t) => t.name === name)?.rank ?? 0 },
      status: null,
      tiers: TIERS,
    });
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function gateFor(kycUrl: string): KycGate {
  const config = {
    get: (key: string) => ({ KYC_URL: kycUrl })[key],
  } as unknown as ConfigService;
  const tokens = { accessToken: () => Promise.resolve('tok-svc-test') } as never;
  return new KycGate(config, tokens);
}

async function outcome(promise: Promise<unknown>): Promise<{ status: number; code: string; message: string } | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    if (err instanceof HttpException) {
      const response = err.getResponse() as { code?: string; message?: string };
      return { status: err.getStatus(), code: response.code ?? '', message: response.message ?? '' };
    }
    throw err;
  }
}

describe('KycGate', () => {
  it('passes a party at the minimum tier', async () => {
    const kyc = await startFakeKyc({ tiers: { party_1: 'TIER_1' } });
    try {
      await gateFor(kyc.url).require('party_1', 'TIER_1');
    } finally {
      await kyc.close();
    }
  });

  it('passes a party above the minimum tier', async () => {
    const kyc = await startFakeKyc({ tiers: { party_1: 'TIER_2' } });
    try {
      await gateFor(kyc.url).require('party_1', 'TIER_1');
    } finally {
      await kyc.close();
    }
  });

  it('refuses a party below the minimum tier with 403 KYC_REQUIRED naming both tiers', async () => {
    const kyc = await startFakeKyc({ tiers: { party_1: 'TIER_0' } });
    try {
      const err = await outcome(gateFor(kyc.url).require('party_1', 'TIER_1'));
      expect(err?.status).toBe(403);
      expect(err?.code).toBe('KYC_REQUIRED');
      expect(err?.message).toBe('verification tier TIER_1 required; current TIER_0');
    } finally {
      await kyc.close();
    }
  });

  it('treats a party with no record as rank 0 and refuses', async () => {
    const kyc = await startFakeKyc({ tiers: {} });
    try {
      const err = await outcome(gateFor(kyc.url).require('nobody', 'TIER_1'));
      expect(err?.status).toBe(403);
      expect(err?.code).toBe('KYC_REQUIRED');
    } finally {
      await kyc.close();
    }
  });

  it('fails closed with 503 KYC_UNAVAILABLE when kyc is unreachable', async () => {
    const kyc = await startFakeKyc({ tiers: {} });
    const url = kyc.url;
    await kyc.close(); // nothing is listening anymore

    const err = await outcome(gateFor(url).require('party_1', 'TIER_1'));
    expect(err?.status).toBe(503);
    expect(err?.code).toBe('KYC_UNAVAILABLE');
  });

  it('fails closed with 503 when kyc answers non-2xx', async () => {
    const kyc = await startFakeKyc({ tiers: {}, status: 500 });
    try {
      const err = await outcome(gateFor(kyc.url).require('party_1', 'TIER_1'));
      expect(err?.status).toBe(503);
      expect(err?.code).toBe('KYC_UNAVAILABLE');
    } finally {
      await kyc.close();
    }
  });

  it('fails closed with 503 when kyc does not define the minimum tier', async () => {
    const kyc = await startFakeKyc({ tiers: { party_1: 'TIER_1' } });
    try {
      const err = await outcome(gateFor(kyc.url).require('party_1', 'TIER_9'));
      expect(err?.status).toBe(503);
      expect(err?.code).toBe('KYC_UNAVAILABLE');
    } finally {
      await kyc.close();
    }
  });

  it('fails closed with 503 when KYC_URL is unset', async () => {
    const config = {
      get: (key: string) => ({ KYC_URL: '' })[key],
    } as unknown as ConfigService;
    const tokens = { accessToken: () => Promise.resolve('tok') } as never;
    const err = await outcome(new KycGate(config, tokens).require('party_1', 'TIER_1'));
    expect(err?.status).toBe(503);
    expect(err?.code).toBe('KYC_UNAVAILABLE');
  });
});
