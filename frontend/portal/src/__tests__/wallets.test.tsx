import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Currency, Wallet } from '@damp/web-shared/api';
import AddWalletWizard from '../components/AddWalletWizard';
import WalletsPage from '../pages/WalletsPage';
import { renderSignedIn } from '../test/auth';
import { resetBalancesVisibility } from '../lib/balancesVisibility';

const { ledger, rates, walletsApi } = vi.hoisted(() => ({
  ledger: { wallets: vi.fn() },
  rates: { rates: vi.fn() },
  walletsApi: { currencies: vi.fn(), createWallet: vi.fn(), updateWallet: vi.fn() },
}));
vi.mock('@damp/web-shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@damp/web-shared/api')>();
  return {
    ...actual,
    ledgerApi: { ...actual.ledgerApi, ...ledger },
    ratesApi: { ...actual.ratesApi, ...rates },
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
  balance: { amount: '10.00', currency: 'USD', decimals: 2, display: '$10.00' },
  ...patch,
});

const currencies: Currency[] = [
  { code: 'USD', kind: 'FIAT', decimals: 2, name: 'US Dollar', nativeChain: '' },
  { code: 'EUR', kind: 'FIAT', decimals: 2, name: 'Euro', nativeChain: '' },
  { code: 'GBP', kind: 'FIAT', decimals: 2, name: 'British Pound', nativeChain: '' },
  { code: 'KES', kind: 'FIAT', decimals: 2, name: 'Kenyan Shilling', nativeChain: '' },
  { code: 'BTC', kind: 'CRYPTO', decimals: 8, name: 'Bitcoin', nativeChain: 'BITCOIN' },
  { code: 'ETH', kind: 'CRYPTO', decimals: 18, name: 'Ethereum', nativeChain: 'ETHEREUM' },
  { code: 'SOL', kind: 'CRYPTO', decimals: 9, name: 'Solana', nativeChain: 'SOLANA' },
  { code: 'USDX', kind: 'CRYPTO', decimals: 6, name: 'USD-X', nativeChain: 'ETHEREUM' },
];

describe('AddWalletWizard', () => {
  beforeEach(() => {
    Object.values(ledger).forEach((fn) => fn.mockReset());
    Object.values(rates).forEach((fn) => fn.mockReset());
    Object.values(walletsApi).forEach((fn) => fn.mockReset());
    walletsApi.currencies.mockResolvedValue(currencies);
    rates.rates.mockResolvedValue({ base: 'USD', entries: [] });
    sessionStorage.clear();
    localStorage.clear();
    resetBalancesVisibility();
  });

  it('offers only currencies the user does not hold and creates the chosen one', async () => {
    const held = [wallet({ id: 'w-usd', currency: 'USD' }), wallet({ id: 'w-btc', currency: 'BTC', balance: { amount: '0.50000000', currency: 'BTC', decimals: 8, display: '0.50000000' } })];
    walletsApi.createWallet.mockResolvedValue(wallet({ id: 'w-eth', currency: 'ETH', label: 'Stack' }));
    renderSignedIn(<AddWalletWizard open onClose={() => undefined} wallets={held} />);

    // Step 1: pick a type.
    await userEvent.click(await screen.findByRole('radio', { name: /Crypto/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 2: BTC is already held, so only ETH and SOL are on offer.
    expect(await screen.findByRole('radio', { name: /Ethereum/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Solana/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Bitcoin/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /Ethereum/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 3: an optional label, then create.
    await userEvent.type(await screen.findByLabelText(/Label/), 'Stack');
    await userEvent.click(screen.getByRole('button', { name: 'Add wallet' }));

    await waitFor(() => expect(walletsApi.createWallet).toHaveBeenCalledWith({ currency: 'ETH', label: 'Stack' }));
    expect(await screen.findByText('Wallet added')).toBeInTheDocument();
  });

  it('keeps held currencies out of the fiat list too', async () => {
    const held = [wallet({ id: 'w-usd', currency: 'USD' }), wallet({ id: 'w-eur', currency: 'EUR' })];
    renderSignedIn(<AddWalletWizard open onClose={() => undefined} wallets={held} />);

    // Fiat is the default step-1 type.
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('radio', { name: /British Pound/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Kenyan Shilling/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /US Dollar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Euro/ })).not.toBeInTheDocument();
  });
});

describe('WalletsPage rename', () => {
  beforeEach(() => {
    Object.values(ledger).forEach((fn) => fn.mockReset());
    Object.values(rates).forEach((fn) => fn.mockReset());
    Object.values(walletsApi).forEach((fn) => fn.mockReset());
    walletsApi.currencies.mockResolvedValue([]);
    rates.rates.mockResolvedValue({ base: 'USD', entries: [] });
    sessionStorage.clear();
    localStorage.clear();
    resetBalancesVisibility();
  });

  it('rejects a label over 64 characters, then saves a valid one', async () => {
    ledger.wallets.mockResolvedValue([wallet({ id: 'w-usd', label: 'Main' })]);
    renderSignedIn(<WalletsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Main' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));

    const input = await screen.findByLabelText('Label');
    await userEvent.type(input, 'x'.repeat(65));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Keep the label to 64 characters or fewer.')).toBeInTheDocument();
    expect(walletsApi.updateWallet).not.toHaveBeenCalled();

    walletsApi.updateWallet.mockResolvedValue(wallet({ id: 'w-usd', label: 'Travel' }));
    await userEvent.clear(input);
    await userEvent.type(input, 'Travel');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(walletsApi.updateWallet).toHaveBeenCalledWith('w-usd', { label: 'Travel' }));
  });
});
