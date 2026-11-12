import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { axiosInstance, get } from '../../../api';
import type { DampWallet } from '../../../types/wallet/dampWallet';
import type { IssuanceState, SagaAccepted, SagaTransfer } from '../../../types/issuance/sagaTransfer';

const initialState: IssuanceState = {
  transfersById: {},
  activeCorrelationId: null,
  submitting: false,
  error: null,
};

function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return message || (error instanceof Error ? error.message : fallback);
}

/** POST /wallets/usdx — idempotent; on Solana bff/core-ledger substitute the platform custody account. */
export const openUsdxWallet = createAsyncThunk<DampWallet, { chain: string; address?: string }, { rejectValue: string }>(
  'issuance/openUsdxWallet',
  async ({ chain, address }, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post<DampWallet>('/wallets/usdx', { chain, address });
      return response.data;
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not open a USD-X wallet'));
    }
  },
);

interface SagaInput {
  fiatWalletId: string;
  usdxWalletId: string;
  amount: string;
}

/**
 * One Idempotency-Key per submission. core-ledger derives the saga's
 * correlation id from it, so a retried request resumes the same mint rather
 * than starting a second one.
 */
function idempotencyHeaders() {
  return { headers: { 'Idempotency-Key': crypto.randomUUID() } };
}

export const issueUsdx = createAsyncThunk<SagaAccepted, SagaInput, { rejectValue: string }>(
  'issuance/issue',
  async (input, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post<SagaAccepted>('/issuances', input, idempotencyHeaders());
      return response.data;
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Issuance failed'));
    }
  },
);

export const redeemUsdx = createAsyncThunk<SagaAccepted, SagaInput, { rejectValue: string }>(
  'issuance/redeem',
  async (input, { rejectWithValue }) => {
    try {
      const response = await axiosInstance.post<SagaAccepted>('/redemptions', input, idempotencyHeaders());
      return response.data;
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Redemption failed'));
    }
  },
);

/** GET /transfers/:correlationId — polled until `terminal`. */
export const fetchTransfer = createAsyncThunk<SagaTransfer, string, { rejectValue: string }>(
  'issuance/fetchTransfer',
  async (correlationId, { rejectWithValue }) => {
    try {
      return await get<SagaTransfer>(`/transfers/${encodeURIComponent(correlationId)}`);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Could not load transfer status'));
    }
  },
);

const issuanceSlice = createSlice({
  name: 'issuance',
  initialState,
  reducers: {
    clearActiveTransfer: (state) => {
      state.activeCorrelationId = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    for (const thunk of [issueUsdx, redeemUsdx]) {
      builder
        .addCase(thunk.pending, (state) => {
          state.submitting = true;
          state.error = null;
        })
        .addCase(thunk.fulfilled, (state, action) => {
          state.submitting = false;
          state.activeCorrelationId = action.payload.correlationId;
        })
        .addCase(thunk.rejected, (state, action) => {
          state.submitting = false;
          state.error = action.payload ?? 'Request failed';
        });
    }
    builder
      .addCase(openUsdxWallet.pending, (state) => {
        state.submitting = true;
        state.error = null;
      })
      .addCase(openUsdxWallet.fulfilled, (state) => {
        state.submitting = false;
      })
      .addCase(openUsdxWallet.rejected, (state, action) => {
        state.submitting = false;
        state.error = action.payload ?? 'Could not open a USD-X wallet';
      })
      .addCase(fetchTransfer.fulfilled, (state, action) => {
        state.transfersById[action.payload.correlationId] = action.payload;
      });
    // A failed poll is deliberately not surfaced as a form error: the next
    // tick retries, and a transient blip should not read as a failed mint.
  },
});

type Root = { issuance: IssuanceState };
export const selectIssuance = (state: Root) => state.issuance;
export const selectActiveTransfer = (state: Root) =>
  state.issuance.activeCorrelationId ? (state.issuance.transfersById[state.issuance.activeCorrelationId] ?? null) : null;

export const { clearActiveTransfer } = issuanceSlice.actions;
export default issuanceSlice.reducer;
