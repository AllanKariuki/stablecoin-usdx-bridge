import type { Payment, BillPayment, ScheduledPayment, Merchant, PaymentRequest } from './payments';

export const mockPayments: Payment[] = [
  {
    id: '1',
    paymentId: 'PAY-2025-001',
    type: 'send',
    amount: 500,
    currency: 'USD',
    recipient: 'John Smith',
    sender: 'You',
    status: 'completed',
    method: 'card',
    description: 'Payment for services',
    reference: 'REF-001',
    fees: 2.5,
    totalAmount: 502.5,
    timestamp: '2025-11-20T10:30:00Z',
    completedAt: '2025-11-20T10:35:00Z'
  },
  {
    id: '2',
    paymentId: 'PAY-2025-002',
    type: 'receive',
    amount: 1000,
    currency: 'USD',
    recipient: 'You',
    sender: 'Jane Doe',
    status: 'completed',
    method: 'bank',
    description: 'Monthly salary',
    reference: 'REF-002',
    fees: 0,
    totalAmount: 1000,
    timestamp: '2025-11-19T14:00:00Z',
    completedAt: '2025-11-19T14:15:00Z'
  },
  {
    id: '3',
    paymentId: 'PAY-2025-003',
    type: 'send',
    amount: 250,
    currency: 'USD',
    recipient: 'Alice Johnson',
    sender: 'You',
    status: 'pending',
    method: 'wallet',
    description: 'Dinner split',
    reference: 'REF-003',
    fees: 1.0,
    totalAmount: 251,
    timestamp: '2025-11-20T15:00:00Z'
  }
];

export const mockBillPayments: BillPayment[] = [
  {
    id: '1',
    billId: 'BILL-2025-001',
    provider: 'City Power Company',
    billType: 'electricity',
    amount: 150.50,
    dueDate: '2025-11-25',
    status: 'paid',
    accountNumber: 'ACC-123456',
    paidDate: '2025-11-20',
    reference: 'BILL-REF-001'
  },
  {
    id: '2',
    billId: 'BILL-2025-002',
    provider: 'Water Utility',
    billType: 'water',
    amount: 75.00,
    dueDate: '2025-11-28',
    status: 'pending',
    accountNumber: 'ACC-789012',
    reference: 'BILL-REF-002'
  },
  {
    id: '3',
    billId: 'BILL-2025-003',
    provider: 'Internet Provider',
    billType: 'internet',
    amount: 59.99,
    dueDate: '2025-12-01',
    status: 'pending',
    accountNumber: 'ACC-345678',
    reference: 'BILL-REF-003'
  }
];

export const mockScheduledPayments: ScheduledPayment[] = [
  {
    id: '1',
    paymentId: 'SCHED-2025-001',
    recipient: 'Gym Membership',
    amount: 50,
    currency: 'USD',
    frequency: 'monthly',
    nextPaymentDate: '2025-12-01',
    status: 'active',
    description: 'Monthly gym membership',
    createdAt: '2025-01-15',
    endDate: '2026-01-15'
  },
  {
    id: '2',
    paymentId: 'SCHED-2025-002',
    recipient: 'Car Insurance',
    amount: 120,
    currency: 'USD',
    frequency: 'monthly',
    nextPaymentDate: '2025-12-10',
    status: 'active',
    description: 'Car insurance premium',
    createdAt: '2024-06-10'
  }
];

export const mockMerchants: Merchant[] = [
  {
    id: '1',
    merchantId: 'MER-001',
    name: 'Coffee House Cafe',
    category: 'Food & Beverage',
    address: '123 Main Street, NYC',
    phone: '212-555-0123',
    acceptedPaymentMethods: ['card', 'mobile_money', 'wallet'],
    rating: 4.5,
    reviewCount: 234,
    savedStatus: true
  },
  {
    id: '2',
    merchantId: 'MER-002',
    name: 'Tech Store',
    category: 'Electronics',
    address: '456 Tech Avenue, NYC',
    phone: '212-555-0456',
    acceptedPaymentMethods: ['card', 'bank'],
    rating: 4.8,
    reviewCount: 512,
    savedStatus: false
  },
  {
    id: '3',
    merchantId: 'MER-003',
    name: 'Super Market Plus',
    category: 'Groceries',
    address: '789 Shopping Way, NYC',
    phone: '212-555-0789',
    acceptedPaymentMethods: ['card', 'mobile_money', 'wallet', 'bank'],
    rating: 4.3,
    reviewCount: 856,
    savedStatus: true
  }
];

export const mockPaymentRequests: PaymentRequest[] = [
  {
    id: '1',
    requestId: 'REQ-2025-001',
    requester: 'Bob Wilson',
    requestee: 'You',
    amount: 200,
    currency: 'USD',
    status: 'pending',
    description: 'Dinner expense',
    expiryDate: '2025-12-01',
    createdAt: '2025-11-20T12:00:00Z'
  },
  {
    id: '2',
    requestId: 'REQ-2025-002',
    requester: 'Sarah Davis',
    requestee: 'You',
    amount: 75,
    currency: 'USD',
    status: 'accepted',
    description: 'Movie tickets',
    expiryDate: '2025-11-28',
    createdAt: '2025-11-18T10:00:00Z',
    respondedAt: '2025-11-18T11:00:00Z'
  }
];
