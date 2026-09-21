export interface Payment {
  id: string;
  paymentId: string;
  type: 'send' | 'receive' | 'request' | 'bill' | 'scheduled';
  amount: number;
  currency: string;
  recipient: string;
  sender: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  method: 'card' | 'bank' | 'wallet' | 'mobile_money';
  description: string;
  reference: string;
  fees: number;
  totalAmount: number;
  timestamp: string;
  completedAt?: string;
  notes?: string;
}

export interface BillPayment {
  id: string;
  billId: string;
  provider: string;
  billType: 'electricity' | 'water' | 'internet' | 'mobile' | 'gas' | 'other';
  amount: number;
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
  accountNumber: string;
  paidDate?: string;
  reference: string;
}

export interface ScheduledPayment {
  id: string;
  paymentId: string;
  recipient: string;
  amount: number;
  currency: string;
  frequency: 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
  nextPaymentDate: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  description: string;
  createdAt: string;
  endDate?: string;
}

export interface Merchant {
  id: string;
  merchantId: string;
  name: string;
  category: string;
  logo?: string;
  website?: string;
  address: string;
  phone?: string;
  email?: string;
  acceptedPaymentMethods: string[];
  rating: number;
  reviewCount: number;
  savedStatus?: boolean;
}

export interface PaymentRequest {
  id: string;
  requestId: string;
  requester: string;
  requestee: string;
  amount: number;
  currency: string;
  status: 'pending' | 'accepted' | 'declined' | 'paid';
  description: string;
  expiryDate: string;
  createdAt: string;
  respondedAt?: string;
}

export interface PaymentsState {
  payments: Payment[];
  billPayments: BillPayment[];
  scheduledPayments: ScheduledPayment[];
  merchants: Merchant[];
  paymentRequests: PaymentRequest[];
  selectedPayment: Payment | null;
  selectedMerchant: Merchant | null;
  loading: boolean;
  error: string | null;
}
