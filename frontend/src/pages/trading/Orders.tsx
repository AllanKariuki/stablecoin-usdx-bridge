import { useState } from 'react';
import { Search, Filter, ChevronDown, TrendingUp, TrendingDown, Clock, CheckCircle, XCircle } from 'lucide-react';
import type { Order, OrderStatus } from '../../types/financial';

const Orders = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState('date');

  // Mock data
  const orders: Order[] = [
    {
      id: '1',
      userId: 'user1',
      type: 'limit',
      side: 'buy',
      pair: 'BTC/USD',
      fromCurrency: 'USD',
      toCurrency: 'BTC',
      amount: 0.5,
      price: 45000,
      filled: 0.5,
      filledPercent: 100,
      status: 'completed',
      fees: 22.50,
      total: 22500,
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: '2024-01-15T10:35:00Z',
      completedAt: '2024-01-15T10:35:00Z'
    },
    {
      id: '2',
      userId: 'user1',
      type: 'market',
      side: 'sell',
      pair: 'ETH/USD',
      fromCurrency: 'ETH',
      toCurrency: 'USD',
      amount: 2,
      price: 2500,
      filled: 1.5,
      filledPercent: 75,
      status: 'partial',
      fees: 75,
      total: 3750,
      createdAt: '2024-01-14T14:20:00Z',
      updatedAt: '2024-01-14T14:25:00Z'
    },
    {
      id: '3',
      userId: 'user1',
      type: 'stop_loss',
      side: 'sell',
      pair: 'BTC/USD',
      fromCurrency: 'BTC',
      toCurrency: 'USD',
      amount: 0.1,
      stopPrice: 40000,
      filled: 0,
      filledPercent: 0,
      status: 'pending',
      fees: 0,
      total: 4000,
      createdAt: '2024-01-15T09:00:00Z',
      updatedAt: '2024-01-15T09:00:00Z'
    },
    {
      id: '4',
      userId: 'user1',
      type: 'limit',
      side: 'buy',
      pair: 'XRP/USD',
      fromCurrency: 'USD',
      toCurrency: 'XRP',
      amount: 1000,
      price: 2.5,
      filled: 0,
      filledPercent: 0,
      status: 'open',
      fees: 0,
      total: 2500,
      createdAt: '2024-01-15T08:00:00Z',
      updatedAt: '2024-01-15T08:00:00Z'
    },
    {
      id: '5',
      userId: 'user1',
      type: 'market',
      side: 'buy',
      pair: 'SOL/USD',
      fromCurrency: 'USD',
      toCurrency: 'SOL',
      amount: 10,
      price: 150,
      filled: 10,
      filledPercent: 100,
      status: 'cancelled',
      fees: 75,
      total: 1575,
      createdAt: '2024-01-13T16:00:00Z',
      updatedAt: '2024-01-13T16:05:00Z'
    }
  ];

  const filteredOrders = orders
    .filter(order => {
      const matchesSearch = order.pair.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           order.id.includes(searchTerm);
      const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'date') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === 'amount') return b.amount - a.amount;
      if (sortBy === 'status') return a.status.localeCompare(b.status);
      return 0;
    });

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'open':
        return 'bg-cyan-100 text-cyan-800';
      case 'cancelled':
      case 'expired':
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'cancelled':
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      case 'pending':
      case 'open':
        return <Clock className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getSideIcon = (side: string) => {
    return side === 'buy' ? 
      <TrendingUp className="w-4 h-4 text-green-600" /> : 
      <TrendingDown className="w-4 h-4 text-red-600" />;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-600 mt-1">View and manage your trading orders</p>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg p-4 mb-6 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by pair or order ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as OrderStatus | 'all')}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="partial">Partial</option>
                <option value="pending">Pending</option>
                <option value="open">Open</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Sort By */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="date">Sort by Date</option>
                <option value="amount">Sort by Amount</option>
                <option value="status">Sort by Status</option>
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Trading Pair</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type / Side</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Amount</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Price</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Filled %</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length > 0 ? (
                  filteredOrders.map((order) => (
                    <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{order.pair}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          {getSideIcon(order.side)}
                          <span className="capitalize">{order.type} / {order.side}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        {order.amount.toFixed(4)} {order.toCurrency}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">
                        ${(order.price || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${order.filledPercent}%` }}
                            />
                          </div>
                          <span className="text-gray-600">{order.filledPercent}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`flex items-center gap-1 px-3 py-1 rounded-full w-fit font-medium ${getStatusColor(order.status)}`}>
                          {getStatusIcon(order.status)}
                          <span className="capitalize">{order.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(order.createdAt).toLocaleDateString()} <br />
                        <span className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleTimeString()}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button className="text-blue-600 hover:text-blue-800 font-medium text-sm">View</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      No orders found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Total Orders</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{orders.length}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Completed</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{orders.filter(o => o.status === 'completed').length}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Pending</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{orders.filter(o => o.status === 'pending' || o.status === 'open').length}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Total Value</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              ${orders.reduce((sum, o) => sum + o.total, 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Orders;
