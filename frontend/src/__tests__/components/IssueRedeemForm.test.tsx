import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import walletReducer from '@src/redux/slices/wallet/walletSlice';
import issuanceReducer from '@src/redux/slices/issuance/issuanceSlice';
import IssueRedeemForm from '@src/components/wallet/IssueRedeemForm';
import type { DampWallet } from '@src/types/wallet/dampWallet';
import type { SagaTransfer } from '@src/types/issuance/sagaTransfer';

const { postMock, getMock } = vi.hoisted(() => ({ postMock: vi.fn(), getMock: vi.fn() }));
vi.mock('@src/api', () => ({
  axiosInstance: { post: postMock },
  get: getMock,
  post: vi.fn(),
}));

const usd: DampWallet = {
  id: 'w-usd',
  userId: 'u1',
  currency: 'USD',
  chain: '',
  address: '',
  status: 'ACTIVE',
  label: 'Main',
  balance: { amount: '250.00', currency: 'USD', decimals: 2, display: '$250.00' },
};
const usdx: DampWallet = {
  ...usd,
  id: 'w-usdx',
  currency: 'USDX',
  chain: 'ETHEREUM',
  address: '0x4e29A6a3689F37db9a93985A0f6424420cc2CD49',
  label: 'USD-X',
  balance: { amount: '0.000000', currency: 'USDX', decimals: 6, display: '0.000000' },
};

function transfer(patch: Partial<SagaTransfer>): SagaTransfer {
  return {
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
  };
}

function renderForm(wallets: DampWallet[]) {
  const store = configureStore({ reducer: { wallet: walletReducer, issuance: issuanceReducer } });
  render(
    <Provider store={store}>
      <IssueRedeemForm wallets={wallets} />
    </Provider>,
  );
}

describe('IssueRedeemForm', () => {
  beforeEach(() => {
    postMock.mockReset();
    getMock.mockReset();
  });

  it('offers to open a USD-X wallet when the caller has none', async () => {
    postMock.mockResolvedValue({ data: usdx });
    getMock.mockResolvedValue([usd, usdx]);
    renderForm([usd]);

    await userEvent.type(screen.getByLabelText('Your Ethereum address'), usdx.address);
    await userEvent.click(screen.getByRole('button', { name: 'Open USD-X wallet' }));

    expect(postMock).toHaveBeenCalledWith('/wallets/usdx', { chain: 'ETHEREUM', address: usdx.address });
  });

  it('issues with an Idempotency-Key and links the mint to the explorer once the saga completes', async () => {
    postMock.mockResolvedValue({ data: { correlationId: 'corr-1', sagaStatus: 'PENDING', transaction: {} } });
    const hash = '0x' + 'ab'.repeat(32);
    getMock.mockImplementation((url: string) =>
      url.startsWith('/transfers/')
        ? Promise.resolve(
            transfer({ status: 'COMPLETED', terminal: true, destTxHash: hash, destTxUrl: `https://sepolia.etherscan.io/tx/${hash}` }),
          )
        : Promise.resolve([usd, usdx]),
    );
    renderForm([usd, usdx]);

    await userEvent.type(screen.getByLabelText('Amount'), '250.00');
    await userEvent.click(screen.getByRole('button', { name: 'Issue USD-X' }));

    const [url, body, config] = postMock.mock.calls[0];
    expect(url).toBe('/issuances');
    expect(body).toEqual({ fiatWalletId: 'w-usd', usdxWalletId: 'w-usdx', amount: '250.00' });
    expect(config.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);

    const link = await screen.findByRole('link', { name: hash });
    expect(link).toHaveAttribute('href', `https://sepolia.etherscan.io/tx/${hash}`);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('/transfers/corr-1');
  });

  it('redeems against /redemptions and shows a burn still awaiting finality', async () => {
    postMock.mockResolvedValue({ data: { correlationId: 'corr-2', sagaStatus: 'PENDING', transaction: {} } });
    getMock.mockResolvedValue(
      transfer({ correlationId: 'corr-2', kind: 'REDEEM', sourceTxHash: '0x' + 'cd'.repeat(32), sourceTxUrl: 'https://x/tx' }),
    );
    renderForm([usd, usdx]);

    await userEvent.click(screen.getByRole('tab', { name: 'Redeem' }));
    await userEvent.type(screen.getByLabelText('Amount'), '100.00');
    await userEvent.click(screen.getByRole('button', { name: 'Redeem USD-X' }));

    expect(postMock.mock.calls[0][0]).toBe('/redemptions');
    await waitFor(() => expect(screen.getByText('Burn submitted, waiting for finality')).toBeInTheDocument());
  });

  it('surfaces a rejected issuance', async () => {
    postMock.mockRejectedValue({ response: { data: { error: 'insufficient funds' } } });
    renderForm([usd, usdx]);

    await userEvent.type(screen.getByLabelText('Amount'), '999.00');
    await userEvent.click(screen.getByRole('button', { name: 'Issue USD-X' }));

    expect(await screen.findByText('insufficient funds')).toBeInTheDocument();
  });
});
