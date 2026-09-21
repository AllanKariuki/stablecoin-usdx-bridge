/**
 * Payment, Bills, and Merchant Types
 * Comprehensive types for payment processing, bill management, and merchant operations
 */

// ============================================================================
// PAYMENT TYPES
// ============================================================================

export type PaymentType = 'send' | 'receive' | 'bill' | 'merchant' | 'subscription' | 'request';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';
export type PaymentMethod = 'bank_transfer' | 'card' | 'mobile_money' | 'wallet' | 'crypto' | 'cash';

export interface Payment {
  id: string;
  userId: string;
  type: PaymentType;
  amount: number;
  currency: string;
  status: PaymentStatus;
  reference: string;
  description: string;
  recipientId?: string;
  recipientName?: string;
  recipientAccount?: string;
  senderId?: string;
  senderName?: string;
  category?: string;
  merchantId?: string;
  billId?: string;
  fees: number;
  netAmount: number;
  paymentMethod: PaymentMethod;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  payerId?: string;
  payerName?: string;
  amount: number;
  currency: string;
  description: string;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  dueDate?: string;
  paymentLink?: string;
  qrCode?: string;
  paidAt?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface ScheduledPayment {
  id: string;
  userId: string;
  recipientId?: string;
  recipientName: string;
  recipientAccount: string;
  amount: number;
  currency: string;
  description: string;
  schedule: RecurringSchedule;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  lastExecuted?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  endDate?: string;
  nextExecutionDate: string;
  isActive: boolean;
  daysOfWeek?: number[]; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
}

// ============================================================================
// BILL TYPES
// ============================================================================

export type BillType = 'electricity' | 'water' | 'internet' | 'mobile' | 'gas' | 'rent' | 'subscription' | 'other';
export type BillStatus = 'pending' | 'paid' | 'overdue' | 'cancelled' | 'partially_paid';

export interface Bill {
  id: string;
  userId: string;
  type: BillType;
  provider: string;
  providerLogo?: string;
  accountNumber: string;
  accountName: string;
  amount?: number;
  dueDate?: string;
  status: BillStatus;
  isRecurring: boolean;
  recurringSchedule?: RecurringSchedule;
  lastPaymentDate?: string;
  nextPaymentDate?: string;
  totalPaid: number;
  remainingBalance: number;
  createdAt: string;
  updatedAt: string;
}

export interface BillPayment {
  id: string;
  billId: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  reference: string;
  provider: string;
  accountNumber: string;
  fees: number;
  receipt?: string;
  paidAt?: string;
  createdAt: string;
}

export interface BillReminder {
  id: string;
  billId: string;
  userId: string;
  reminderType: 'email' | 'sms' | 'push' | 'in_app';
  daysBeforeDue: number;
  isEnabled: boolean;
  lastSent?: string;
}

// ============================================================================
// MERCHANT TYPES
// ============================================================================

export type MerchantCategory = 'retail' | 'food' | 'transport' | 'utilities' | 'entertainment' | 'healthcare' | 'education' | 'other';

export interface Merchant {
  id: string;
  name: string;
  category: MerchantCategory;
  logo?: string;
  accountNumber?: string;
  accountName?: string;
  paymentMethods: PaymentMethod[];
  isSaved: boolean;
  description?: string;
  website?: string;
  location?: string;
}

export interface SavedMerchant {
  id: string;
  userId: string;
  merchantId: string;
  merchantName: string;
  accountDetails: string;
  nickname?: string;
  category: MerchantCategory;
  isFavorite: boolean;
  lastUsed?: string;
  totalTransactions: number;
  totalSpent: number;
  createdAt: string;
}

export interface MerchantPayment {
  id: string;
  merchantId: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  reference: string;
  transactionId?: string;
  receiptUrl?: string;
  createdAt: string;
}

// ============================================================================
// SUBSCRIPTION TYPES
// ============================================================================

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'expired' | 'pending';
export type SubscriptionBillingCycle = 'monthly' | 'quarterly' | 'semi-annual' | 'annual';

export interface Subscription {
  id: string;
  userId: string;
  serviceName: string;
  serviceCategory: string;
  logo?: string;
  amount: number;
  currency: string;
  billingCycle: SubscriptionBillingCycle;
  status: SubscriptionStatus;
  startDate: string;
  endDate?: string;
  nextBillingDate: string;
  autoRenewal: boolean;
  paymentMethod: PaymentMethod;
  description?: string;
  website?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPayment {
  id: string;
  subscriptionId: string;
  userId: string;
  amount: number;
  currency: string;
  billingCycle: SubscriptionBillingCycle;
  status: PaymentStatus;
  paidDate: string;
  nextPaymentDate: string;
  reference: string;
}

// ============================================================================
// INVOICE TYPES
// ============================================================================

export interface Invoice {
  id: string;
  userId: string;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled';
  recipientName: string;
  recipientEmail: string;
  recipientAddress?: string;
  amount: number;
  currency: string;
  items: InvoiceItem[];
  tax?: number;
  discount?: number;
  notes?: string;
  dueDate?: string;
  issuedDate: string;
  paidDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxable: boolean;
}

// ============================================================================
// RECEIPT TYPES
// ============================================================================

export interface Receipt {
  id: string;
  userId: string;
  transactionId: string;
  transactionType: 'payment' | 'deposit' | 'withdrawal' | 'bill' | 'subscription';
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  recipientName?: string;
  recipientAccount?: string;
  description: string;
  reference: string;
  timestamp: string;
  receiptUrl?: string;
  isPrinted: boolean;
  isEmailed: boolean;
  createdAt: string;
}

// ============================================================================
// REFUND TYPES
// ============================================================================

export type RefundStatus = 'requested' | 'approved' | 'processing' | 'completed' | 'rejected';
export type RefundReason = 'duplicate_payment' | 'payment_error' | 'service_cancellation' | 'customer_request' | 'other';

export interface Refund {
  id: string;
  userId: string;
  originalPaymentId: string;
  amount: number;
  currency: string;
  reason: RefundReason;
  status: RefundStatus;
  description?: string;
  refundMethod: PaymentMethod;
  bankDetails?: {
    accountNumber: string;
    accountHolderName: string;
    bankName: string;
  };
  requestedAt: string;
  approvedAt?: string;
  completedAt?: string;
  rejectionReason?: string;
}

// ============================================================================
// TRANSFER TYPES
// ============================================================================

export interface Transfer {
  id: string;
  senderId: string;
  senderName: string;
  recipientId?: string;
  recipientName: string;
  recipientAccount: string;
  amount: number;
  currency: string;
  transferType: 'domestic' | 'international';
  status: PaymentStatus;
  fees: number;
  exchangeRate?: number;
  reference: string;
  notes?: string;
  createdAt: string;
  completedAt?: string;
}

// ============================================================================
// TRANSACTION HISTORY TYPES
// ============================================================================

export type TransactionType = 'deposit' | 'withdrawal' | 'payment_sent' | 'payment_received' | 'transfer' | 'bill_payment' | 'conversion';

export interface TransactionHistory {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: PaymentStatus;
  description: string;
  reference: string;
  counterpartyName?: string;
  fees?: number;
  balance?: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

// ============================================================================
// PAYMENT LINK TYPES
// ============================================================================

export interface PaymentLink {
  id: string;
  userId: string;
  amount?: number; // if null, recipient can enter amount
  currency: string;
  description: string;
  recipientEmail?: string;
  status: 'active' | 'used' | 'expired' | 'cancelled';
  expiresAt?: string;
  shareUrl: string;
  qrCode?: string;
  createdAt: string;
}

// ============================================================================
// RECURRING TRANSFER TYPES
// ============================================================================

export interface RecurringTransfer {
  id: string;
  userId: string;
  recipientName: string;
  recipientAccount: string;
  amount: number;
  currency: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  endDate?: string;
  nextExecutionDate: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  autoExecute: boolean;
  lastExecuted?: string;
  createdAt: string;
  updatedAt: string;
}
