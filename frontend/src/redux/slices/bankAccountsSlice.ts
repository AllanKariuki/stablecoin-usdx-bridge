import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { UserBankAccount, LinkedAccount, Bank } from '../../types/bankAccounts';
import { MOCK_USER_BANK_ACCOUNTS, MOCK_LINKED_ACCOUNTS, MOCK_BANKS } from '../../types/bankAccounts';
import { del, get, post } from '../../api';

interface BankAccountsState {
  userBankAccounts: UserBankAccount[];
  linkedAccounts: LinkedAccount[];
  availableBanks: Bank[];
  loading: boolean;
  error: string | null;
}

const initialState: BankAccountsState = {
  userBankAccounts: [],
  linkedAccounts: [],
  availableBanks: [],
  loading: false,
  error: null,
};

// Async Thunks
export const fetchAvailableBanks = createAsyncThunk(
  'bankAccounts/fetchAvailableBanks',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get<Bank[]>('/api/banks/available');
      return { data: response };
    } catch (error: any) {
      console.warn('API failed for available banks, using mock data:', error);
      return rejectWithValue({
        error: error?.response?.data?.message || 'Failed to fetch available banks',
        mockData: MOCK_BANKS
      });
    }
  }
);

export const fetchUserBankAccounts = createAsyncThunk(
  'bankAccounts/fetchUserBankAccounts',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get<UserBankAccount[]>('/api/banks/user-accounts');
      return { data: response };
    } catch (error: any) {
      console.warn('API failed for user bank accounts, using mock data:', error);
      return rejectWithValue({
        error: error?.response?.data?.message || 'Failed to fetch user bank accounts',
        mockData: MOCK_USER_BANK_ACCOUNTS
      });
    }
  }
);

export const fetchLinkedAccounts = createAsyncThunk(
  'bankAccounts/fetchLinkedAccounts',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get<LinkedAccount[]>('/api/banks/linked-accounts');
      return { data: response };
    } catch (error: any) {
      console.warn('API failed for linked accounts, using mock data:', error);
      return rejectWithValue({
        error: error?.response?.data?.message || 'Failed to fetch linked accounts',
        mockData: MOCK_LINKED_ACCOUNTS
      });
    }
  }
);

export const registerBankAccount = createAsyncThunk(
  'bankAccounts/registerBankAccount',
  async (accountData: Omit<UserBankAccount, 'id'>, { rejectWithValue }) => {
    try {
      const response = await post<UserBankAccount, Omit<UserBankAccount, 'id'>>('/api/banks/register', accountData);
      return { data: response };
    } catch (error: any) {
      console.warn('API failed for registering bank account, using mock data:', error);
      const newAccount: UserBankAccount = {
        ...accountData,
        id: `uba${Date.now()}`,
      };
      return rejectWithValue({
        error: error?.response?.data?.message || 'Failed to register bank account',
        mockData: newAccount
      });
    }
  }
);

export const linkBankAccount = createAsyncThunk(
  'bankAccounts/linkBankAccount',
  async (accountData: Omit<LinkedAccount, 'id'>, { rejectWithValue }) => {
    try {
      const response = await post<LinkedAccount, Omit<LinkedAccount, 'id'>>('/api/banks/link', accountData);
      return { data: response };
    } catch (error: any) {
      console.warn('API failed for linking bank account, using mock data:', error);
      const newLinkedAccount: LinkedAccount = {
        ...accountData,
        id: `l${Date.now()}`,
      };
      return rejectWithValue({
        error: error?.response?.data?.message || 'Failed to link bank account',
        mockData: newLinkedAccount
      });
    }
  }
);

export const unlinkBankAccount = createAsyncThunk(
  'bankAccounts/unlinkBankAccount',
  async (accountId: string, { rejectWithValue }) => {
    try {
      await del(`/api/banks/unlink/${accountId}`);
      return { id: accountId };
    } catch (error: any) {
      console.warn(`API failed for unlinking bank account ${accountId}, proceeding with mock delete:`, error);
      return rejectWithValue({
        error: error?.response?.data?.message || 'Failed to unlink bank account',
        mockData: accountId
      });
    }
  }
);

export const removeBankAccount = createAsyncThunk(
  'bankAccounts/removeBankAccount',
  async (accountId: string, { rejectWithValue }) => {
    try {
      await del(`/api/banks/remove/${accountId}`);
      return { id: accountId };
    } catch (error: any) {
      console.warn(`API failed for removing bank account ${accountId}, proceeding with mock delete:`, error);
      return rejectWithValue({
        error: error?.response?.data?.message || 'Failed to remove bank account',
        mockData: accountId
      });
    }
  }
);

const bankAccountsSlice = createSlice({
  name: 'bankAccounts',
  initialState,
  reducers: {
    // User Bank Accounts
    addUserBankAccount: (state, action: PayloadAction<UserBankAccount>) => {
      state.userBankAccounts.push(action.payload);
    },
    updateUserBankAccount: (state, action: PayloadAction<UserBankAccount>) => {
      const index = state.userBankAccounts.findIndex((acc) => acc.id === action.payload.id);
      if (index !== -1) {
        state.userBankAccounts[index] = action.payload;
      }
    },
    removeUserBankAccount: (state, action: PayloadAction<string>) => {
      state.userBankAccounts = state.userBankAccounts.filter((acc) => acc.id !== action.payload);
    },
    setUserBankAccounts: (state, action: PayloadAction<UserBankAccount[]>) => {
      state.userBankAccounts = action.payload;
    },

    // Linked Accounts
    addLinkedAccount: (state, action: PayloadAction<LinkedAccount>) => {
      state.linkedAccounts.push(action.payload);
    },
    updateLinkedAccount: (state, action: PayloadAction<LinkedAccount>) => {
      const index = state.linkedAccounts.findIndex((acc) => acc.id === action.payload.id);
      if (index !== -1) {
        state.linkedAccounts[index] = action.payload;
      }
    },
    removeLinkedAccount: (state, action: PayloadAction<string>) => {
      state.linkedAccounts = state.linkedAccounts.filter((acc) => acc.id !== action.payload);
    },
    setLinkedAccounts: (state, action: PayloadAction<LinkedAccount[]>) => {
      state.linkedAccounts = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Fetch Available Banks
    builder
      .addCase(fetchAvailableBanks.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAvailableBanks.fulfilled, (state, action) => {
        state.loading = false;
        state.availableBanks = action.payload.data;
      })
      .addCase(fetchAvailableBanks.rejected, (state, action: any) => {
        state.loading = false;
        state.error = action.payload?.error || action.error.message || 'Failed to fetch available banks';
        if (action.payload?.mockData) {
          state.availableBanks = action.payload.mockData;
        }
      });

    // Fetch User Bank Accounts
    builder
      .addCase(fetchUserBankAccounts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUserBankAccounts.fulfilled, (state, action) => {
        state.loading = false;
        state.userBankAccounts = action.payload.data;
      })
      .addCase(fetchUserBankAccounts.rejected, (state, action: any) => {
        state.loading = false;
        state.error = action.payload?.error || action.error.message || 'Failed to fetch user bank accounts';
        if (action.payload?.mockData) {
          state.userBankAccounts = action.payload.mockData;
        }
      });

    // Fetch Linked Accounts
    builder
      .addCase(fetchLinkedAccounts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchLinkedAccounts.fulfilled, (state, action) => {
        state.loading = false;
        state.linkedAccounts = action.payload.data;
      })
      .addCase(fetchLinkedAccounts.rejected, (state, action: any) => {
        state.loading = false;
        state.error = action.payload?.error || action.error.message || 'Failed to fetch linked accounts';
        if (action.payload?.mockData) {
          state.linkedAccounts = action.payload.mockData;
        }
      });

    // Register Bank Account
    builder
      .addCase(registerBankAccount.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerBankAccount.fulfilled, (state, action) => {
        state.loading = false;
        state.userBankAccounts.push(action.payload.data);
      })
      .addCase(registerBankAccount.rejected, (state, action: any) => {
        state.loading = false;
        state.error = action.payload?.error || action.error.message || 'Failed to register bank account';
        if (action.payload?.mockData) {
          state.userBankAccounts.push(action.payload.mockData);
        }
      });

    // Link Bank Account
    builder
      .addCase(linkBankAccount.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(linkBankAccount.fulfilled, (state, action) => {
        state.loading = false;
        state.linkedAccounts.push(action.payload.data);
      })
      .addCase(linkBankAccount.rejected, (state, action: any) => {
        state.loading = false;
        state.error = action.payload?.error || action.error.message || 'Failed to link bank account';
        if (action.payload?.mockData) {
          state.linkedAccounts.push(action.payload.mockData);
        }
      });

    // Unlink Bank Account
    builder
      .addCase(unlinkBankAccount.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(unlinkBankAccount.fulfilled, (state, action) => {
        state.loading = false;
        state.linkedAccounts = state.linkedAccounts.filter((acc) => acc.id !== action.payload.id);
      })
      .addCase(unlinkBankAccount.rejected, (state, action: any) => {
        state.loading = false;
        state.error = action.payload?.error || action.error.message || 'Failed to unlink bank account';
        if (action.payload?.mockData) {
          state.linkedAccounts = state.linkedAccounts.filter((acc) => acc.id !== action.payload.mockData);
        }
      });

    // Remove Bank Account
    builder
      .addCase(removeBankAccount.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(removeBankAccount.fulfilled, (state, action) => {
        state.loading = false;
        state.userBankAccounts = state.userBankAccounts.filter((acc) => acc.id !== action.payload.id);
      })
      .addCase(removeBankAccount.rejected, (state, action: any) => {
        state.loading = false;
        state.error = action.payload?.error || action.error.message || 'Failed to remove bank account';
        if (action.payload?.mockData) {
          state.userBankAccounts = state.userBankAccounts.filter((acc) => acc.id !== action.payload.mockData);
        }
      });
  },
});

export const {
  addUserBankAccount,
  updateUserBankAccount,
  removeUserBankAccount,
  setUserBankAccounts,
  addLinkedAccount,
  updateLinkedAccount,
  removeLinkedAccount,
  setLinkedAccounts,
} = bankAccountsSlice.actions;

export default bankAccountsSlice.reducer;
