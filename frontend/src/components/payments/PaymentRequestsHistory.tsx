import React from 'react';
import SearchableTable from '../general/SearchableTable';
import type { PaymentRequest } from '../../types/financial';
import type { FilterConfig } from '../../types/general/searchTable';

const PaymentRequestsHistory: React.FC = () => {
  const paymentRequests: PaymentRequest[] = [
    {
      id: '1',
      requesterId: 'user1',
      requesterName: 'You',
      payerName: 'John Doe',
      amount: 500,
      currency: 'USD',
      description: 'Payment for consulting services',
      status: 'paid',
      dueDate: '2024-01-20',
      paymentLink: 'https://pay.example.com/req/abc123',
      qrCode: 'data:image/png;base64,...',
      paidAt: '2024-01-15T14:30:00Z',
      createdAt: '2024-01-10T10:00:00Z'
    },
    {
      id: '2',
      requesterId: 'user1',
      requesterName: 'You',
      payerName: 'Jane Smith',
      amount: 1200,
      currency: 'USD',
      description: 'Monthly subscription payment',
      status: 'pending',
      dueDate: '2024-01-25',
      paymentLink: 'https://pay.example.com/req/def456',
      qrCode: 'data:image/png;base64,...',
      createdAt: '2024-01-12T09:00:00Z'
    },
    {
      id: '3',
      requesterId: 'user1',
      requesterName: 'You',
      amount: 750,
      currency: 'USD',
      description: 'Invoice INV-001',
      status: 'expired',
      expiresAt: '2024-01-14T23:59:59Z',
      paymentLink: 'https://pay.example.com/req/ghi789',
      createdAt: '2024-01-10T12:00:00Z'
    },
    {
      id: '4',
      requesterId: 'user1',
      requesterName: 'You',
      payerName: 'Michael Brown',
      amount: 2500,
      currency: 'USD',
      description: 'Project milestone payment',
      status: 'paid',
      dueDate: '2024-01-18',
      paymentLink: 'https://pay.example.com/req/jkl012',
      qrCode: 'data:image/png;base64,...',
      paidAt: '2024-01-17T16:45:00Z',
      createdAt: '2024-01-08T11:30:00Z'
    },
    {
      id: '5',
      requesterId: 'user1',
      requesterName: 'You',
      payerName: 'Sarah Wilson',
      amount: 350,
      currency: 'USD',
      description: 'Freelance design work',
      status: 'pending',
      dueDate: '2024-01-30',
      paymentLink: 'https://pay.example.com/req/mno345',
      qrCode: 'data:image/png;base64,...',
      createdAt: '2024-01-14T13:20:00Z'
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const columns = [
    {
      header: 'From',
      accessor: 'payerName',
      render: (_: any, record: PaymentRequest) => (
        <span className="font-medium text-gray-900">{record.payerName || 'Unnamed'}</span>
      ),
    },
    {
      header: 'Amount',
      accessor: 'amount',
      render: (_: any, record: PaymentRequest) => (
        <span className="font-semibold text-gray-900">
          {record.amount} {record.currency}
        </span>
      ),
    },
    {
      header: 'Description',
      accessor: 'description',
      render: (_: any, record: PaymentRequest) => (
        <span className="text-gray-600">{record.description}</span>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (_: any, record: PaymentRequest) => (
        <span className={`px-3 py-1 rounded-full font-medium text-xs ${getStatusColor(record.status)}`}>
          {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
        </span>
      ),
    },
    {
      header: 'Due Date',
      accessor: 'dueDate',
      render: (_: any, record: PaymentRequest) => (
        <span className="text-gray-600">
          {record.dueDate ? new Date(record.dueDate).toLocaleDateString() : 'N/A'}
        </span>
      ),
    },
  ];

  const actions = [
    {
      label: 'View',
      onClick: (record: PaymentRequest) => {
        console.log('View payment request:', record);
      },
    },
  ];

  const filters: FilterConfig[] = [
  {
    key: 'status',
    label: 'Status',
    options: [
      { label: 'All', value: '' },
      { label: 'Completed', value: 'completed' },
      { label: 'Pending', value: 'pending' },
      { label: 'Failed', value: 'failed' },
      { label: 'Cancelled', value: 'cancelled' },
      { label: 'Processing', value: 'processing' },
      { label: 'Refunded', value: 'refunded' },
    ]
  },
  {
    key: 'paymentMethod',
    label: 'Payment Method',
    options: [
      { label: 'All', value: '' },
      { label: 'Card', value: 'card' },
      { label: 'Bank Transfer', value: 'bank_transfer' },
      { label: 'Cash', value: 'cash' },
      { label: 'Mobile Money', value: 'mobile_money' },
    ]
  }
];

  return (
    <div className="overflow-hidden">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900">Recent Payment Requests</h2>
      </div>
      <SearchableTable
        data={paymentRequests}
        columns={columns}
        actions={actions}
        filters={filters}
        searchPlaceholder="Search payment requests..."
      />
    </div>
  );
};

export default PaymentRequestsHistory;
