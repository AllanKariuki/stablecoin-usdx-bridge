import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@damp/web-shared/auth';
import { pricingApi, type PricingPair } from '@damp/web-shared/api/pricing';
import { treasuryApi, type ExposureRow, type TreasuryRebalance } from '@damp/web-shared/api/treasury';
import Exposure from '../pages/treasury/Exposure';
import PricingPairs from '../pages/treasury/PricingPairs';

const exposure: ExposureRow = {
  currency: 'BTC',
  decimals: 8,
  customerLiabilities: '1.50000000',
  custodyHoldings: '1.40000000',
  fxPosition: '0',
  netExposure: '-0.10000000',
  limits: { currency: 'BTC', maxShort: '5', maxLong: '5', updatedBy: 'treasurer-1', updatedAt: '2026-11-01T00:00:00Z' },
  utilisationBps: 200,
  custodianSnapshot: { custodianIds: ['cust-btc'], balance: '1.40000000', asOf: '2026-11-26T00:00:00Z', statementRef: 'st-1' },
  recon: { status: 'MATCH', tolerance: '0', custodianReported: '1.40000000', ledgerHoldings: '1.40000000', diff: '0' },
};

const rebalance: TreasuryRebalance = {
  id: 'rebal_1',
  side: 'BUY',
  currency: 'BTC',
  amount: '0.5',
  fiat_currency: 'USD',
  fiat_amount: '50000',
  custodian_ref: 'ref-1',
  note: 'test',
  ledger_tx_id: 'ltx-1',
  created_by: 'treasurer-1',
  created_at: '2026-11-26T00:00:00Z',
};

const pairs: PricingPair[] = [
  { baseCcy: 'BTC', quoteCcy: 'USD', spreadBps: 25, ttlSeconds: 30, enabled: true, maxNotionalUsd: '1000000', updatedAt: '2026-11-26T00:00:00Z', updatedBy: 'treasurer-1' },
];

const b64url = (value: object) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function signInAs(...roles: string[]) {
  const token = [b64url({ alg: 'none' }), b64url({ sub: 'staff-1', name: 'Test Staff', exp: Math.floor(Date.now() / 1000) + 3600, realm_access: { roles } }), 'sig'].join('.');
  sessionStorage.setItem('damp.access_token', token);
}

function renderAt(path: string, element: React.ReactNode, route: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(treasuryApi, 'exposure').mockResolvedValue([exposure]);
  vi.spyOn(treasuryApi, 'rebalances').mockResolvedValue([rebalance]);
  vi.spyOn(treasuryApi, 'postRebalance').mockResolvedValue(rebalance);
  vi.spyOn(pricingApi, 'pairs').mockResolvedValue(pairs);
  vi.spyOn(pricingApi, 'rates').mockResolvedValue({
    base: 'USD',
    entries: [
      { currency: 'BTC', rate: '100000.00', status: 'OK', sources: ['stub'], at: '2026-11-26T00:00:00Z' },
      { currency: 'EUR', rate: '0.92', status: 'STALE', sources: [], at: null },
    ],
  });
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('treasury exposure page', () => {
  it('renders exposure rows from the mocked API', async () => {
    signInAs('treasury');
    renderAt('/exposure', <Exposure />, '/exposure');
    expect(await screen.findByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('1.50000000')).toBeInTheDocument();
    expect(screen.getByText('-0.10000000')).toBeInTheDocument();
    expect(screen.getByText('[-5, +5]')).toBeInTheDocument();
    expect(screen.getByText('MATCH')).toBeInTheDocument();
  });

  it('hides the edit controls without reserves:manage', async () => {
    signInAs('auditor');
    renderAt('/exposure', <Exposure />, '/exposure');
    expect(await screen.findByText('BTC')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /record rebalance/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edit mandate/i })).toBeNull();
  });

  it('submits the rebalance modal with the right body', async () => {
    signInAs('treasury');
    renderAt('/exposure', <Exposure />, '/exposure');
    fireEvent.click(await screen.findByRole('button', { name: /record rebalance/i }));

    fireEvent.change(await screen.findByLabelText('Amount'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText('Fiat amount'), { target: { value: '50000' } });
    fireEvent.click(screen.getByText('Sell crypto'));
    fireEvent.click(screen.getByRole('button', { name: /post rebalance/i, hidden: true }));

    expect(treasuryApi.postRebalance).toHaveBeenCalledWith({
      side: 'SELL',
      currency: 'BTC',
      amount: '0.5',
      fiat_currency: 'USD',
      fiat_amount: '50000',
      custodian_ref: undefined,
      note: undefined,
    });
  });
});

describe('pricing page', () => {
  it('renders rates and pairs from the mocked API', async () => {
    signInAs('treasury');
    renderAt('/pricing', <PricingPairs />, '/pricing');
    expect(await screen.findByText('BTC/USD')).toBeInTheDocument();
    expect(screen.getByText('100000.00')).toBeInTheDocument();
    expect(screen.getByText('STALE')).toBeInTheDocument();
    expect(screen.getByText('25 bps')).toBeInTheDocument();
  });

  it('hides the pair edit control without reserves:manage', async () => {
    signInAs('auditor');
    renderAt('/pricing', <PricingPairs />, '/pricing');
    expect(await screen.findByText('BTC/USD')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit BTC\/USD/i })).toBeNull();
  });
});
