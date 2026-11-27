import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import type { QuotePreview, Wallet } from '@damp/web-shared/api';
import SwapCard from '../components/SwapCard';
import { renderSignedIn } from '../test/auth';

const { ledger, fx, walletsApi } = vi.hoisted(() => ({
  ledger: { wallets: vi.fn() },
  fx: { quote: vi.fn(), convert: vi.fn() },
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

const wallet = (patch: Partial<Wallet>): Wallet => ({
  id: 'w-1',
  userId: 'u1',
  currency: 'USD',
  chain: '',
  address: '',
  status: 'ACTIVE',
  label: '',
  isDefault: true,
  balance: { amount: '1000.00', currency: 'USD', decimals: 2, display: '$1,000.00' },
  ...patch,
});

const usd = wallet({ id: 'w-usd', label: 'Main', balance: { amount: '1000.00', currency: 'USD', decimals: 2, display: '$1,000.00' } });
const btc = wallet({ id: 'w-btc', currency: 'BTC', label: 'Savings', balance: { amount: '0.05000000', currency: 'BTC', decimals: 8, display: '0.05000000' } });

/** An FX quote expiring `ttlMs` from "now" (mocked Date). */
const fxQuote = (ttlMs: number): QuotePreview => ({
  quoteId: 'q1',
  route: 'FX',
  from: 'USD',
  to: 'BTC',
  amount: '100.00',
  rate: '0.00001667',
  fee: '0.25',
  net: '0.0016628',
  expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  amountSide: 'FROM',
  spreadBps: 25,
});

/**
 * Flush the mocked wallet fetch through React. With fake timers,
 * testing-library's findBy* waits are faked too, and userEvent's internal
 * waits deadlock — so these tests flush explicitly and drive the controls
 * with synchronous fireEvent, keeping only the debounce/countdown on the
 * fake clock (which is what they assert).
 */
const flush = async () => {
  await act(async () => {});
  await act(async () => {});
};

describe('SwapCard', () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    Object.values(ledger).forEach((fn) => fn.mockReset());
    Object.values(fx).forEach((fn) => fn.mockReset());
    walletsApi.currencies.mockReset().mockResolvedValue([]);
    ledger.wallets.mockResolvedValue([usd, btc]);
    sessionStorage.clear();
  });

  it('quotes on a 500ms debounce and converts with a per-quote Idempotency-Key', async () => {
    vi.useFakeTimers();
    fx.quote.mockImplementation(async () => fxQuote(30_000));
    fx.convert.mockResolvedValue({ route: 'FX', transaction: {}, correlationId: null, sagaStatus: null, status: 'POSTED' });

    renderSignedIn(<SwapCard />);
    await flush();

    act(() => {
      fireEvent.change(screen.getByLabelText('Receive in'), { target: { value: 'w-btc' } });
      fireEvent.change(screen.getByLabelText('You pay'), { target: { value: '100' } });
    });

    // Nothing before the debounce…
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(fx.quote).not.toHaveBeenCalled();
    // …then one quote, pinned to the FROM amount.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(fx.quote).toHaveBeenCalledTimes(1);
    expect(fx.quote).toHaveBeenCalledWith({ fromWalletId: 'w-usd', toWalletId: 'w-btc', amount: '100', amountSide: 'FROM' });

    expect(screen.getByText('0.0016628 BTC')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Convert now' }));
    });
    expect(fx.convert).toHaveBeenCalledTimes(1);
    const [body, key] = fx.convert.mock.calls[0];
    expect(body).toEqual({ fromWalletId: 'w-usd', toWalletId: 'w-btc', amount: '100.00', quoteId: 'q1' });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    // Let the success toast and wallet reload settle inside act.
    await flush();
  });

  it('re-quotes automatically when the countdown reaches zero', async () => {
    vi.useFakeTimers();
    fx.quote.mockImplementation(async () => fxQuote(8_000));

    renderSignedIn(<SwapCard />);
    await flush();
    act(() => {
      fireEvent.change(screen.getByLabelText('Receive in'), { target: { value: 'w-btc' } });
      fireEvent.change(screen.getByLabelText('You pay'), { target: { value: '100' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(fx.quote).toHaveBeenCalledTimes(1);

    // The quote lives 8s: let the countdown expire — the card re-quotes itself.
    await act(async () => {
      vi.advanceTimersByTime(8_100);
    });
    expect(fx.quote).toHaveBeenCalledTimes(2);
  });

  it('handles a USD↔USD-X peg pair as a no-expiry ISSUANCE route', async () => {
    vi.useFakeTimers();
    const usdx = wallet({ id: 'w-usdx', currency: 'USDX', chain: 'ETHEREUM', label: 'USD-X', balance: { amount: '0.000000', currency: 'USDX', decimals: 6, display: '0.000000' } });
    ledger.wallets.mockResolvedValue([usd, usdx]);
    fx.quote.mockImplementation(async (): Promise<QuotePreview> => ({
      quoteId: null,
      route: 'ISSUANCE',
      from: 'USD',
      to: 'USDX',
      amount: '100.00',
      rate: '1',
      fee: '0',
      net: '100.00',
      expiresAt: null,
    }));

    renderSignedIn(<SwapCard />);
    await flush();
    act(() => {
      fireEvent.change(screen.getByLabelText('Receive in'), { target: { value: 'w-usdx' } });
      fireEvent.change(screen.getByLabelText('You pay'), { target: { value: '100' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText(/Issue USD-X/)).toBeInTheDocument();
    expect(screen.getByText('100.00 USDX')).toBeInTheDocument();
    expect(screen.queryByText(/Quote expires in/)).not.toBeInTheDocument();
  });
});
