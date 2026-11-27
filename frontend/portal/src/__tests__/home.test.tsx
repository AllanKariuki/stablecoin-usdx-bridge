import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DashboardView, Wallet } from '@damp/web-shared/api';
import HomePage from '../pages/HomePage';
import { renderSignedIn } from '../test/auth';
import { resetBalancesVisibility } from '../lib/balancesVisibility';

const { ledger, rates, kyc, approvals, walletsApi } = vi.hoisted(() => ({
  ledger: { dashboard: vi.fn(), wallets: vi.fn() },
  rates: { rates: vi.fn(), history: vi.fn() },
  kyc: { status: vi.fn() },
  approvals: { list: vi.fn() },
  walletsApi: { currencies: vi.fn() },
}));
vi.mock('@damp/web-shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@damp/web-shared/api')>();
  return {
    ...actual,
    ledgerApi: { ...actual.ledgerApi, ...ledger },
    ratesApi: { ...actual.ratesApi, ...rates },
    kycApi: { ...actual.kycApi, ...kyc },
    approvalsApi: { ...actual.approvalsApi, ...approvals },
    walletsApi: { ...actual.walletsApi, ...walletsApi },
  };
});
vi.mock('@damp/web-shared/api/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@damp/web-shared/api/payments')>();
  return { ...actual, paymentsApi: { ...actual.paymentsApi, beneficiaries: vi.fn().mockResolvedValue([]) } };
});

const wallet = (patch: Partial<Wallet>): Wallet => ({
  id: 'w-1',
  userId: 'u1',
  currency: 'USD',
  chain: '',
  address: '',
  status: 'ACTIVE',
  label: '',
  isDefault: true,
  balance: { amount: '0.10', currency: 'USD', decimals: 2, display: '$0.10' },
  ...patch,
});

const board = (entries: Array<{ currency: string; rate: string | null }>) => ({
  base: 'USD',
  entries: entries.map((e) => ({ currency: e.currency, rate: e.rate, status: 'OK' as const, sources: ['x'], at: new Date().toISOString(), change_24h_pct: null })),
});

const history = (symbol: string, prices: string[]) => ({
  base: 'USD',
  range: '1M',
  series: [
    { symbol, points: prices.map((price, i) => ({ t: new Date(1_700_000_000_000 + i * 60_000).toISOString(), price })), change_pct: null },
  ],
});

describe('HomePage', () => {
  beforeEach(() => {
    Object.values(ledger).forEach((fn) => fn.mockReset());
    Object.values(rates).forEach((fn) => fn.mockReset());
    kyc.status.mockReset().mockResolvedValue(null);
    approvals.list.mockReset().mockResolvedValue([]);
    ledger.wallets.mockResolvedValue([]);
    walletsApi.currencies.mockReset().mockResolvedValue([]);
    sessionStorage.clear();
    localStorage.clear();
    resetBalancesVisibility();
  });

  it('totals the portfolio with BigInt-exact decimal sums (0.1 + 0.11 + 0.1, not 0.31000000000000005)', async () => {
    const dash: DashboardView = {
      wallets: [
        wallet({ id: 'w-usd', currency: 'USD', balance: { amount: '0.10', currency: 'USD', decimals: 2, display: '$0.10' } }),
        wallet({ id: 'w-eur', currency: 'EUR', label: 'Travel', balance: { amount: '0.10', currency: 'EUR', decimals: 2, display: '€0.10' } }),
        wallet({ id: 'w-usdx', currency: 'USDX', chain: 'SOLANA', label: 'USD-X', balance: { amount: '0.10', currency: 'USDX', decimals: 6, display: '0.100000' } }),
      ],
      recentTransactions: [],
    };
    ledger.dashboard.mockResolvedValue(dash);
    rates.rates.mockResolvedValue(board([{ currency: 'EUR', rate: '1.10' }]));
    rates.history.mockResolvedValue({ base: 'USD', range: '1M', series: [] });

    renderSignedIn(<HomePage />);

    // 0.10 (USD) + 0.10×1.10 (EUR) + 0.10 (USD-X, 1:1) = 0.31 exactly.
    expect(await screen.findByText('$0.31')).toBeInTheDocument();
    // The note only appears when a rate is missing — it must not.
    expect(screen.queryByText(/Some prices are unavailable/)).not.toBeInTheDocument();
  });

  it('shows — and the missing-prices note when a wallet has no rate', async () => {
    ledger.dashboard.mockResolvedValue({
      wallets: [wallet({ id: 'w-usd', balance: { amount: '10.00', currency: 'USD', decimals: 2, display: '$10.00' } }), wallet({ id: 'w-btc', currency: 'BTC', balance: { amount: '0.50000000', currency: 'BTC', decimals: 8, display: '0.50000000' } })],
      recentTransactions: [],
    });
    rates.rates.mockResolvedValue(board([])); // no BTC rate
    rates.history.mockResolvedValue({ base: 'USD', range: '1M', series: [] });

    renderSignedIn(<HomePage />);

    // The total ($10.00, BTC left out) renders; the BTC row shows it has no price.
    expect((await screen.findAllByText('$10.00')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Some prices are unavailable/)).toBeInTheDocument();
    expect(screen.getByText('price unavailable')).toBeInTheDocument();
  });

  it('refetches history with the right range when a tab is picked', async () => {
    ledger.dashboard.mockResolvedValue({ wallets: [], recentTransactions: [] });
    rates.rates.mockResolvedValue(board([]));
    rates.history.mockResolvedValue({ base: 'USD', range: '1M', series: [] });

    renderSignedIn(<HomePage />);

    await screen.findByRole('group', { name: 'Chart range' });
    expect(rates.history).toHaveBeenCalledWith(['BTC', 'ETH', 'SOL'], '1M', 'USD');

    await userEvent.click(screen.getByRole('button', { name: '1W' }));
    await waitFor(() => expect(rates.history).toHaveBeenCalledWith(['BTC', 'ETH', 'SOL'], '1W', 'USD'));

    // Series with enough points still chart after the refetch.
    rates.history.mockResolvedValue(history('BTC', ['100', '101']));
    await userEvent.click(screen.getByRole('button', { name: '1D' }));
    await waitFor(() => expect(rates.history).toHaveBeenCalledWith(['BTC', 'ETH', 'SOL'], '1D', 'USD'));
  });

  it('hides every balance behind the eye toggle and remembers it', async () => {
    ledger.dashboard.mockResolvedValue({
      wallets: [wallet({ id: 'w-usd', balance: { amount: '250.00', currency: 'USD', decimals: 2, display: '$250.00' } })],
      recentTransactions: [],
    });
    rates.rates.mockResolvedValue(board([]));
    rates.history.mockResolvedValue({ base: 'USD', range: '1M', series: [] });

    renderSignedIn(<HomePage />);

    // The total and the portfolio row both show it.
    expect((await screen.findAllByText('$250.00')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Hide balances' }));

    expect(screen.queryByText('$250.00')).not.toBeInTheDocument();
    expect(screen.getAllByText('••••••').length).toBeGreaterThan(0);
    expect(localStorage.getItem('portal.hide-balances')).toBe('1');

    await userEvent.click(screen.getByRole('button', { name: 'Show balances' }));
    expect((await screen.findAllByText('$250.00')).length).toBeGreaterThan(0);
    expect(localStorage.getItem('portal.hide-balances')).toBeNull();
  });
});
