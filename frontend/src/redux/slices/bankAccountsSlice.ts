import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { del, get, post } from '../../api';

/**
 * Bank accounts, against the real `/banks/*` endpoints.
 *
 * Every thunk in this file used to catch its own error and `rejectWithValue`
 * a blob of `MOCK_*` data, which the reducers then wrote into state as though
 * it had come from the server. The result was a UI that showed three
 * plausible bank accounts to a user who had none, and that looked identical
 * whether the backend was healthy, misconfigured, or absent — which is how
 * this feature survived P0 through P3 with nothing behind it.
 *
 * services/payments now serves these routes (see
 * services/payments/src/banks/banks.controller.ts), so the fallbacks are
 * gone: a failed request is an error the UI surfaces, not a reason to invent
 * accounts.
 */

export interface Bank {
  id: string;
  name: string;
  country: string;
  currency: string;
  swiftCode: string;
  rail: string;
  logoUrl: string;
}

export interface BankAccount {
  id: string;
  bankId: string;
  bankName: string;
  accountName: string;
  /**
   * `••••1234`. The full number is not held anywhere in this platform: only
   * the last four digits are stored, so this is everything there is rather
   * than a redaction of something the server could reveal.
   */
  accountNumberMasked: string;
  currency: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REMOVED';
  isDefault: boolean;
  verifiedAt: string | null;
}

export interface Beneficiary {
  id: string;
  name: string;
  kind: 'BANK' | 'WALLET' | 'MOBILE';
  bankId: string | null;
  accountRef: string;
  currency: string;
  targetPartyId: string;
}

interface BankAccountsState {
  availableBanks: Bank[];
  accounts: BankAccount[];
  beneficiaries: Beneficiary[];
  loading: boolean;
  submitting: boolean;
  error: string | null;
}

const initialState: BankAccountsState = {
  availableBanks: [],
  accounts: [],
  beneficiaries: [],
  loading: false,
  submitting: false,
  error: null,
};

function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return message || (error instanceof Error ? error.message : fallback);
}

export const fetchAvailableBanks = createAsyncThunk<Bank[], void, { rejectValue: string }>(
  'bankAccounts/fetchAvailableBanks',
  async (_, { rejectWithValue }) => {
    try {
      return await get<Bank[]>('/banks/available');
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Failed to load banks'));
    }
  },
);

export const fetchBankAccounts = createAsyncThunk<BankAccount[], void, { rejectValue: string }>(
  'bankAccounts/fetchBankAccounts',
  async (_, { rejectWithValue }) => {
    try {
      return await get<BankAccount[]>('/banks/user-accounts');
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Failed to load your bank accounts'));
    }
  },
);

export const registerBankAccount = createAsyncThunk<
  BankAccount,
  { bankId: string; accountName: string; accountNumber: string; currency?: string },
  { rejectValue: string }
>('bankAccounts/registerBankAccount', async (input, { rejectWithValue }) => {
  try {
    return await post<BankAccount, typeof input>('/banks/register', input);
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Failed to register the account'));
  }
});

/**
 * Verification. Separate from registration because the difference is
 * meaningful to a customer and to the platform: a withdrawal may only target
 * a VERIFIED account, and conflating the two would let money be sent to an
 * account nobody has proved they control.
 */
export const linkBankAccount = createAsyncThunk<BankAccount, string, { rejectValue: string }>(
  'bankAccounts/linkBankAccount',
  async (accountId, { rejectWithValue }) => {
    try {
      return await post<BankAccount, { accountId: string }>('/banks/link', { accountId });
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Failed to verify the account'));
    }
  },
);

export const removeBankAccount = createAsyncThunk<string, string, { rejectValue: string }>(
  'bankAccounts/removeBankAccount',
  async (accountId, { rejectWithValue }) => {
    try {
      await del<{ id: string }>(`/banks/user-accounts/${accountId}`);
      return accountId;
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Failed to remove the account'));
    }
  },
);

export const fetchBeneficiaries = createAsyncThunk<Beneficiary[], void, { rejectValue: string }>(
  'bankAccounts/fetchBeneficiaries',
  async (_, { rejectWithValue }) => {
    try {
      return await get<Beneficiary[]>('/banks/beneficiaries');
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Failed to load beneficiaries'));
    }
  },
);

export const addBeneficiary = createAsyncThunk<
  Beneficiary,
  { name: string; kind?: Beneficiary['kind']; bankId?: string; accountRef: string; currency: string; targetPartyId?: string },
  { rejectValue: string }
>('bankAccounts/addBeneficiary', async (input, { rejectWithValue }) => {
  try {
    return await post<Beneficiary, typeof input>('/banks/beneficiaries', input);
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Failed to add the beneficiary'));
  }
});

const bankAccountsSlice = createSlice({
  name: 'bankAccounts',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAvailableBanks.fulfilled, (state, action) => {
        state.availableBanks = action.payload;
        state.loading = false;
      })
      .addCase(fetchBankAccounts.fulfilled, (state, action) => {
        state.accounts = action.payload;
        state.loading = false;
      })
      .addCase(fetchBeneficiaries.fulfilled, (state, action) => {
        state.beneficiaries = action.payload;
        state.loading = false;
      })
      .addCase(registerBankAccount.fulfilled, (state, action) => {
        // Replace rather than append: registering an account already on file
        // is an update server-side (the ON CONFLICT in registerAccount), so
        // appending would show the same account twice.
        state.accounts = [...state.accounts.filter((a) => a.id !== action.payload.id), action.payload];
        state.submitting = false;
      })
      .addCase(linkBankAccount.fulfilled, (state, action) => {
        state.accounts = state.accounts.map((a) => (a.id === action.payload.id ? action.payload : a));
        state.submitting = false;
      })
      .addCase(removeBankAccount.fulfilled, (state, action) => {
        state.accounts = state.accounts.filter((a) => a.id !== action.payload);
        state.submitting = false;
      })
      .addCase(addBeneficiary.fulfilled, (state, action) => {
        state.beneficiaries = [...state.beneficiaries.filter((b) => b.id !== action.payload.id), action.payload];
        state.submitting = false;
      })
      // The matchers below replace what used to be twelve near-identical
      // pending/rejected cases. The rejected one in particular: every one of
      // them wrote mock data into state, and collapsing them here made that
      // impossible to reintroduce by accident.
      .addMatcher(
        (action) => action.type.startsWith('bankAccounts/') && action.type.endsWith('/pending'),
        (state, action: { type: string }) => {
          state.error = null;
          if (action.type.startsWith('bankAccounts/fetch')) state.loading = true;
          else state.submitting = true;
        },
      )
      .addMatcher(
        (action) => action.type.startsWith('bankAccounts/') && action.type.endsWith('/rejected'),
        (state, action: { payload?: string; error?: { message?: string } }) => {
          state.loading = false;
          state.submitting = false;
          state.error = action.payload ?? action.error?.message ?? 'Something went wrong';
        },
      );
  },
});

export const { clearError } = bankAccountsSlice.actions;
export default bankAccountsSlice.reducer;
