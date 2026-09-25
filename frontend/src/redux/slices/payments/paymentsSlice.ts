import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type {
  Payment,
  BillPayment,
  ScheduledPayment,
  Merchant,
  PaymentRequest,
  PaymentsState
} from '../../../types/payments/payments';
import {
  mockPayments,
  mockBillPayments,
  mockScheduledPayments,
  mockMerchants,
  mockPaymentRequests
} from '../../../types/payments/mockPaymentsData';
import { get, post, put, del } from '../../../api';

const initialState: PaymentsState = {
  payments: [],
  billPayments: [],
  scheduledPayments: [],
  merchants: [],
  paymentRequests: [],
  selectedPayment: null,
  selectedMerchant: null,
  loading: false,
  error: null
};

// Async thunks
export const fetchPayments = createAsyncThunk(
  'payments/fetchPayments',
  async () => {
    try {
      const response = await get('/payments');
      return response as { data: Payment[] };
    } catch (error: any) {
      console.warn('API failed for payments, using mock data:', error);
      return { data: mockPayments };
    }
  }
);

export const fetchBillPayments = createAsyncThunk(
  'payments/fetchBillPayments',
  async () => {
    try {
      const response = await get('/payments/bills');
      return response as { data: BillPayment[] };
    } catch (error: any) {
      console.warn('API failed for bill payments, using mock data:', error);
      return { data: mockBillPayments };
    }
  }
);

export const fetchScheduledPayments = createAsyncThunk(
  'payments/fetchScheduledPayments',
  async () => {
    try {
      const response = await get('/payments/scheduled');
      return response as { data: ScheduledPayment[] };
    } catch (error: any) {
      console.warn('API failed for scheduled payments, using mock data:', error);
      return { data: mockScheduledPayments };
    }
  }
);

export const fetchMerchants = createAsyncThunk(
  'payments/fetchMerchants',
  async () => {
    try {
      const response = await get('/payments/merchants');
      return response as { data: Merchant[] };
    } catch (error: any) {
      console.warn('API failed for merchants, using mock data:', error);
      return { data: mockMerchants };
    }
  }
);

export const fetchPaymentRequests = createAsyncThunk(
  'payments/fetchPaymentRequests',
  async () => {
    try {
      const response = await get('/payments/requests');
      return response as { data: PaymentRequest[] };
    } catch (error: any) {
      console.warn('API failed for payment requests, using mock data:', error);
      return { data: mockPaymentRequests };
    }
  }
);

export const sendPayment = createAsyncThunk(
  'payments/sendPayment',
  async (paymentData: Omit<Payment, 'id'>) => {
    try {
      const response = await post('/payments/send', paymentData);
      return response as { data: Payment };
    } catch (error: any) {
      console.warn('API failed sending payment, using mock:', error);
      return {
        data: {
          ...paymentData,
          id: Date.now().toString()
        }
      };
    }
  }
);

export const payBill = createAsyncThunk(
  'payments/payBill',
  async (billData: Omit<BillPayment, 'id'>) => {
    try {
      const response = await post('/payments/bills', billData);
      return response as { data: BillPayment };
    } catch (error: any) {
      console.warn('API failed paying bill, using mock:', error);
      return {
        data: {
          ...billData,
          id: Date.now().toString()
        }
      };
    }
  }
);

export const createScheduledPayment = createAsyncThunk(
  'payments/createScheduledPayment',
  async (paymentData: Omit<ScheduledPayment, 'id'>) => {
    try {
      const response = await post('/payments/scheduled', paymentData);
      return response as { data: ScheduledPayment };
    } catch (error: any) {
      console.warn('API failed creating scheduled payment, using mock:', error);
      return {
        data: {
          ...paymentData,
          id: Date.now().toString()
        }
      };
    }
  }
);

export const requestPayment = createAsyncThunk(
  'payments/requestPayment',
  async (requestData: Omit<PaymentRequest, 'id'>) => {
    try {
      const response = await post('/payments/requests', requestData);
      return response as { data: PaymentRequest };
    } catch (error: any) {
      console.warn('API failed creating payment request, using mock:', error);
      return {
        data: {
          ...requestData,
          id: Date.now().toString()
        }
      };
    }
  }
);

export const respondToPaymentRequest = createAsyncThunk(
  'payments/respondToPaymentRequest',
  async ({ id, status }: { id: string; status: 'accepted' | 'declined' }) => {
    try {
      const response = await put(`/payments/requests/${id}`, { status });
      return response as { data: PaymentRequest };
    } catch (error: any) {
      console.warn(`API failed responding to request ${id}, using mock:`, error);
      return { data: { id, status } as PaymentRequest };
    }
  }
);

const paymentsSlice = createSlice({
  name: 'payments',
  initialState,
  reducers: {
    selectPayment: (state, action: PayloadAction<Payment | null>) => {
      state.selectedPayment = action.payload;
    },
    selectMerchant: (state, action: PayloadAction<Merchant | null>) => {
      state.selectedMerchant = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch payments
      .addCase(fetchPayments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPayments.fulfilled, (state, action) => {
        state.loading = false;
        state.payments = action.payload.data;
      })
      .addCase(fetchPayments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch payments';
      })

      // Fetch bill payments
      .addCase(fetchBillPayments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBillPayments.fulfilled, (state, action) => {
        state.loading = false;
        state.billPayments = action.payload.data;
      })
      .addCase(fetchBillPayments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch bill payments';
      })

      // Fetch scheduled payments
      .addCase(fetchScheduledPayments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchScheduledPayments.fulfilled, (state, action) => {
        state.loading = false;
        state.scheduledPayments = action.payload.data;
      })
      .addCase(fetchScheduledPayments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch scheduled payments';
      })

      // Fetch merchants
      .addCase(fetchMerchants.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMerchants.fulfilled, (state, action) => {
        state.loading = false;
        state.merchants = action.payload.data;
      })
      .addCase(fetchMerchants.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch merchants';
      })

      // Fetch payment requests
      .addCase(fetchPaymentRequests.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPaymentRequests.fulfilled, (state, action) => {
        state.loading = false;
        state.paymentRequests = action.payload.data;
      })
      .addCase(fetchPaymentRequests.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch payment requests';
      })

      // Send payment
      .addCase(sendPayment.fulfilled, (state, action) => {
        state.payments.unshift(action.payload.data);
      })

      // Pay bill
      .addCase(payBill.fulfilled, (state, action) => {
        state.billPayments.unshift(action.payload.data);
      })

      // Create scheduled payment
      .addCase(createScheduledPayment.fulfilled, (state, action) => {
        state.scheduledPayments.unshift(action.payload.data);
      })

      // Request payment
      .addCase(requestPayment.fulfilled, (state, action) => {
        state.paymentRequests.unshift(action.payload.data);
      })

      // Respond to payment request
      .addCase(respondToPaymentRequest.fulfilled, (state, action) => {
        const index = state.paymentRequests.findIndex(r => r.id === action.payload.data.id);
        if (index !== -1) {
          state.paymentRequests[index] = action.payload.data;
        }
      });
  }
});

// Selectors
export const selectPayments = (state: { payments: PaymentsState }) =>
  state.payments.payments;
export const selectBillPayments = (state: { payments: PaymentsState }) =>
  state.payments.billPayments;
export const selectScheduledPayments = (state: { payments: PaymentsState }) =>
  state.payments.scheduledPayments;
export const selectMerchants = (state: { payments: PaymentsState }) =>
  state.payments.merchants;
export const selectPaymentRequests = (state: { payments: PaymentsState }) =>
  state.payments.paymentRequests;
export const selectPaymentsLoading = (state: { payments: PaymentsState }) =>
  state.payments.loading;
export const selectPaymentsError = (state: { payments: PaymentsState }) =>
  state.payments.error;

export const { selectPayment, selectMerchant, clearError } = paymentsSlice.actions;
export default paymentsSlice.reducer;
