import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SagaTransfer, Wallet } from '@damp/web-shared/api';
import IssueRedeemForm from '../components/IssueRedeemForm';
import { renderSignedIn } from '../test/auth';

const { ledger } = vi.hoisted(() => ({
  ledger: { issue: vi.fn(), redeem: vi.fn(), sagaTransfer: vi.fn(), createUsdxWallet: vi.fn() },
}));
vi.mock('@damp/web-shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@damp/web-shared/api')>();
  return { ...actual, ledgerApi: { ...actual.ledgerApi, ...ledger } };
});

const usd: Wallet = {
  id: 'w-usd',
  userId: 'u1',
  currency: 'USD',
  chain: '',
  address: '',
  status: 'ACTIVE',
  label: 'Main',
  balance: { amount: '250.00', currency: 'USD', decimals: 2, display: '$250.00' },
};
const usdx: Wallet = {
  ...usd,
  id: 'w-usdx',
  currency: 'USDX',
  chain: 'ETHEREUM',
  address: '0x4e29A6a3689F37db9a93985A0f6424420cc2CD49',
  label: 'USD-X',
  balance: { amount: '0.000000', currency: 'USDX', decimals: 6, display: '0.000000' },
};

const transfer = (patch: Partial<SagaTransfer>): SagaTransfer => ({
  correlationId: 'corr-1',
  kind: 'MINT',
  status: 'PENDING',
  terminal: false,
  amount: { amount: '250.000000', currency: 'USDX', decimals: 6, display: '250.000000' },
  sourceChain: '',
  targetChain: 'ETHEREUM',
  sourceAddress: '',
  targetAddress: usdx.address,
  sourceTxHash: '',
  destTxHash: '',
  sourceTxUrl: null,
  destTxUrl: null,
  attempts: 0,
  nextAttemptAt: '',
  lastError: '',
  ledgerTxId: 'tx-1',
  createdAt: '',
  updatedAt: '',
  ...patch,
});

describe('IssueRedeemForm', () => {
  beforeEach(() => {
    Object.values(ledger).forEach((fn) => fn.mockReset());
    sessionStorage.clear();
  });

  it('offers to open a USD-X wallet when the caller has none', async () => {
    ledger.createUsdxWallet.mockResolvedValue(usdx);
    renderSignedIn(<IssueRedeemForm wallets={[usd]} />);

    await userEvent.type(await screen.findByLabelText('Your Ethereum address'), usdx.address);
    await userEvent.click(screen.getByRole('button', { name: 'Open USD-X wallet' }));

    expect(ledger.createUsdxWallet).toHaveBeenCalledWith({ chain: 'ETHEREUM', address: usdx.address });
  });

  it('reviews before issuing, sends one Idempotency-Key, and links the final mint', async () => {
    ledger.issue.mockResolvedValue({ correlationId: 'corr-1', sagaStatus: 'PENDING', transaction: {} });
    const hash = '0x' + 'ab'.repeat(32);
    ledger.sagaTransfer.mockResolvedValue(transfer({ status: 'COMPLETED', terminal: true, destTxHash: hash, destTxUrl: `https://sepolia.etherscan.io/tx/${hash}` }));
    renderSignedIn(<IssueRedeemForm wallets={[usd, usdx]} />);

    await userEvent.type(await screen.findByLabelText('Amount'), '250.00');
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(ledger.issue).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Issue USD-X' }));

    const [body, key] = ledger.issue.mock.calls[0];
    expect(body).toEqual({ fiatWalletId: 'w-usd', usdxWalletId: 'w-usdx', amount: '250.00' });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);

    const link = await screen.findByRole('link', { name: hash });
    expect(link).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${hash}`);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(ledger.sagaTransfer).toHaveBeenCalledWith('corr-1');
  });

  it('redeems and shows a burn still awaiting finality', async () => {
    ledger.redeem.mockResolvedValue({ correlationId: 'corr-2', sagaStatus: 'PENDING', transaction: {} });
    ledger.sagaTransfer.mockResolvedValue(transfer({ correlationId: 'corr-2', kind: 'REDEEM', sourceTxHash: '0x' + 'cd'.repeat(32), sourceTxUrl: 'https://x/tx' }));
    renderSignedIn(<IssueRedeemForm wallets={[usd, usdx]} />);

    await userEvent.click(await screen.findByRole('tab', { name: 'Redeem' }));
    await userEvent.type(screen.getByLabelText('Amount'), '100.00');
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Redeem USD-X' }));

    expect(ledger.redeem).toHaveBeenCalledWith({ usdxWalletId: 'w-usdx', fiatWalletId: 'w-usd', amount: '100.00' }, expect.any(String));
    await waitFor(() => expect(screen.getByText('Burn submitted, waiting for finality')).toBeInTheDocument());
  });

  it('rejects a malformed amount without calling the API', async () => {
    renderSignedIn(<IssueRedeemForm wallets={[usd, usdx]} />);
    await userEvent.type(await screen.findByLabelText('Amount'), '1.234');
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByText('At most 2 decimal places.')).toBeInTheDocument();
    expect(ledger.issue).not.toHaveBeenCalled();
  });

  it('surfaces a rejected issuance and keeps the review open', async () => {
    ledger.issue.mockRejectedValue(new Error('insufficient funds'));
    renderSignedIn(<IssueRedeemForm wallets={[usd, usdx]} />);

    await userEvent.type(await screen.findByLabelText('Amount'), '999.00');
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Issue USD-X' }));

    expect(await screen.findByText('insufficient funds')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Issue USD-X' })).toBeEnabled();
  });
});
