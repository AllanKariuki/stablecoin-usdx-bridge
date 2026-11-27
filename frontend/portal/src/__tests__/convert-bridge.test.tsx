import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Money, SagaTransfer, Transaction, TransactionEntry, Wallet } from '@damp/web-shared/api';
import ConvertPage from '../pages/ConvertPage';
import BridgeCard from '../components/BridgeCard';
import { renderSignedIn } from '../test/auth';

const { ledger, fx, walletsApi } = vi.hoisted(() => ({
  ledger: { wallets: vi.fn(), bridge: vi.fn(), sagaTransfer: vi.fn(), createUsdxWallet: vi.fn() },
  fx: { conversions: vi.fn(), quote: vi.fn(), convert: vi.fn() },
  walletsApi: { currencies: vi.fn() },
}));
vi.mock('@damp/web-shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@damp/web-shared/api')>();
  return {
    ...actual,
    ledgerApi: { ...actual.ledgerApi, ...ledger },
    fxApi: { ...actual.fxApi, ...fx },
    walletsApi: { ...actual.walletsApi, ...walletsApi },
  };
});

const money = (amount: string, currency: string, decimals: number, display: string): Money => ({ amount, currency, decimals, display });

const wallet = (patch: Partial<Wallet>): Wallet => ({
  id: 'w-1',
  userId: 'u1',
  currency: 'USD',
  chain: '',
  address: '',
  status: 'ACTIVE',
  label: '',
  isDefault: true,
  balance: money('1000.00', 'USD', 2, '$1,000.00'),
  ...patch,
});

const usdWallet = wallet({ id: 'w-usd', label: 'Main' });
const btcWallet = wallet({
  id: 'w-btc',
  currency: 'BTC',
  label: 'Savings',
  balance: money('0.05000000', 'BTC', 8, '0.05000000'),
});
const ethUsdx = wallet({
  id: 'w-usdx-eth',
  currency: 'USDX',
  chain: 'ETHEREUM',
  label: 'USD-X Ethereum',
  balance: money('0.000000', 'USDX', 6, '0.000000'),
});
const solUsdx = wallet({
  id: 'w-usdx-sol',
  currency: 'USDX',
  chain: 'SOLANA',
  label: 'USD-X Solana',
  balance: money('0.000000', 'USDX', 6, '0.000000'),
});

const entry = (lineNo: number, accountId: string, direction: string, currency: string, amount: Money): TransactionEntry => ({
  lineNo,
  accountId,
  direction,
  currency,
  amount,
  runningBalance: amount,
  description: '',
});

const conversion = (patch: Partial<Transaction>): Transaction => ({
  id: 'tx-1',
  type: 'FX_CONVERSION',
  status: 'POSTED',
  reversed: false,
  valueDate: '2026-11-27T09:00:00.000Z',
  description: 'Convert',
  externalRef: '',
  createdAt: '2026-11-27T09:00:00.000Z',
  entries: [],
  ...patch,
});

const tx1 = conversion({
  id: 'tx-1',
  fx: { rate: '129.500000', spreadBps: 100 },
  entries: [
    entry(1, '2100.USD.w-usd', 'DEBIT', 'USD', money('100.00', 'USD', 2, '$100.00')),
    entry(2, '2100.BTC.w-btc', 'CREDIT', 'BTC', money('0.00166', 'BTC', 8, '0.00166')),
  ],
});
const tx2 = conversion({
  id: 'tx-2',
  entries: [
    entry(1, '2100.USD.w-usd', 'DEBIT', 'USD', money('50.00', 'USD', 2, '$50.00')),
    entry(2, '2100.BTC.w-btc', 'CREDIT', 'BTC', money('0.00083', 'BTC', 8, '0.00083')),
  ],
});

const terminalTransfer: SagaTransfer = {
  correlationId: 'corr-1',
  kind: 'BRIDGE',
  status: 'COMPLETED',
  terminal: true,
  amount: money('100.000000', 'USDX', 6, '100.000000'),
  sourceChain: 'ETHEREUM',
  targetChain: 'SOLANA',
  sourceAddress: '',
  targetAddress: '',
  sourceTxHash: '',
  destTxHash: '',
  sourceTxUrl: null,
  destTxUrl: null,
  attempts: 0,
  nextAttemptAt: '',
  lastError: '',
  ledgerTxId: 'tx-ledger',
  createdAt: '',
  updatedAt: '',
};

describe('Convert page and USD-X bridge', () => {
  beforeEach(() => {
    Object.values(ledger).forEach((fn) => fn.mockReset());
    Object.values(fx).forEach((fn) => fn.mockReset());
    walletsApi.currencies.mockReset().mockResolvedValue([]);
    ledger.wallets.mockResolvedValue([usdWallet, btcWallet]);
    ledger.bridge.mockResolvedValue({ correlationId: 'corr-1', kind: 'BRIDGE', sagaStatus: 'PENDING', amount: money('100.000000', 'USDX', 6, '100.000000') });
    ledger.sagaTransfer.mockResolvedValue(terminalTransfer);
    sessionStorage.clear();
  });

  it('renders conversion history and requests the next cursor on "Load more"', async () => {
    fx.conversions
      .mockResolvedValueOnce({ transactions: [tx1, tx2], nextCursor: 'c1' })
      .mockResolvedValueOnce({ transactions: [], nextCursor: '' });

    renderSignedIn(<ConvertPage />);

    expect(await screen.findByRole('heading', { name: 'Conversion history' })).toBeInTheDocument();
    // Both rows render: the amounts-in are unique to the history table.
    expect(await screen.findByText('0.00166')).toBeInTheDocument();
    expect(await screen.findByText('0.00083')).toBeInTheDocument();
    expect(screen.getAllByText('BTC')).toHaveLength(2);
    // The booked rate comes through bff's `fx`; a row without it shows a dash.
    expect(await screen.findByText('129.500000')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(1);
    expect(fx.conversions).toHaveBeenLastCalledWith({ cursor: undefined, limit: 25 });

    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    await waitFor(() => expect(fx.conversions).toHaveBeenLastCalledWith({ cursor: 'c1', limit: 25 }));
  });

  it('bridges the other chain with the right body and one Idempotency-Key', async () => {
    renderSignedIn(<BridgeCard wallets={[ethUsdx, solUsdx]} />);

    await userEvent.type(await screen.findByLabelText('Amount'), '100');
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(ledger.bridge).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Move USD-X' }));

    await waitFor(() => expect(ledger.bridge).toHaveBeenCalledTimes(1));
    const [body, key] = ledger.bridge.mock.calls[0];
    expect(body).toEqual({ fromWalletId: 'w-usdx-eth', toWalletId: 'w-usdx-sol', amount: '100' });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);

    // The saga is followed to its terminal state, and its timeline names the
    // burn and mint chains rather than the issuance steps.
    await waitFor(() => expect(ledger.sagaTransfer).toHaveBeenCalledWith('corr-1'));
    expect(await screen.findByText('Burned on Ethereum')).toBeInTheDocument();
    expect(screen.getByText('Minted on Solana')).toBeInTheDocument();
    expect(screen.getByText('Credited to your Solana wallet')).toBeInTheDocument();
  });

  it('shows the open-wallet step when the destination chain has no USD-X wallet', async () => {
    renderSignedIn(<BridgeCard wallets={[ethUsdx]} />);

    expect(await screen.findByText('Open a USD-X wallet on Solana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open USD-X wallet' })).toBeInTheDocument();
  });
});
