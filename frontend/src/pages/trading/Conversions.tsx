import { useState } from 'react';
import { ArrowRightLeft, Search, Calendar, TrendingUp, ChevronDown } from 'lucide-react';
import type { Conversion } from '../../types/financial';

const Conversions = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed' | 'failed'>('all');
  const [dateRange, setDateRange] = useState('30days');

  // Mock data
  const conversions: Conversion[] = [
    {
      id: '1',
      userId: 'user1',
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      fromAmount: 1000,
      toAmount: 920,
      exchangeRate: 0.92,
      fees: 5,
      status: 'completed',
      reference: 'CONV-001-2024',
      createdAt: '2024-01-15T10:30:00Z',
      completedAt: '2024-01-15T10:35:00Z'
    },
    {
      id: '2',
      userId: 'user1',
      fromCurrency: 'BTC',
      toCurrency: 'USD',
      fromAmount: 0.5,
      toAmount: 22500,
      exchangeRate: 45000,
      fees: 22.50,
      status: 'completed',
      reference: 'CONV-002-2024',
      createdAt: '2024-01-14T14:20:00Z',
      completedAt: '2024-01-14T14:25:00Z'
    },
    {
      id: '3',
      userId: 'user1',
      fromCurrency: 'GBP',
      toCurrency: 'USD',
      fromAmount: 500,
      toAmount: 630,
      exchangeRate: 1.26,
      fees: 3.15,
      status: 'pending',
      reference: 'CONV-003-2024',
      createdAt: '2024-01-15T09:00:00Z'
    },
    {
      id: '4',
      userId: 'user1',
      fromCurrency: 'JPY',
      toCurrency: 'USD',
      fromAmount: 100000,
      toAmount: 680,
      exchangeRate: 0.0068,
      fees: 3.40,
      status: 'completed',
      reference: 'CONV-004-2024',
      createdAt: '2024-01-13T16:00:00Z',
      completedAt: '2024-01-13T16:05:00Z'
    },
    {
      id: '5',
      userId: 'user1',
      fromCurrency: 'ETH',
      toCurrency: 'BTC',
      fromAmount: 2,
      toAmount: 0.08,
      exchangeRate: 0.04,
      fees: 0.0004,
      status: 'failed',
      reference: 'CONV-005-2024',
      createdAt: '2024-01-12T11:20:00Z'
    },
    {
      id: '6',
      userId: 'user1',
      fromCurrency: 'USD',
      toCurrency: 'KES',
      fromAmount: 100,
      toAmount: 13000,
      exchangeRate: 130,
      fees: 65,
      status: 'completed',
      reference: 'CONV-006-2024',
      createdAt: '2024-01-11T08:30:00Z',
      completedAt: '2024-01-11T08:35:00Z'
    }
  ];

  const filteredConversions = conversions
    .filter(conv => {
      const matchesSearch = 
        conv.fromCurrency.includes(searchTerm.toUpperCase()) ||
        conv.toCurrency.includes(searchTerm.toUpperCase()) ||
        conv.reference.includes(searchTerm);
      const matchesStatus = filterStatus === 'all' || conv.status === filterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const calculateStats = () => {
    return {
      totalConversions: filteredConversions.length,
      completed: filteredConversions.filter(c => c.status === 'completed').length,
      pending: filteredConversions.filter(c => c.status === 'pending').length,
      totalFees: filteredConversions.reduce((sum, c) => sum + c.fees, 0)
    };
  };

  const stats = calculateStats();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Currency Conversions</h1>
          <p className="text-gray-600 mt-1">View all your currency conversion history</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Total Conversions</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalConversions}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Completed</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{stats.completed}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Pending</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{stats.pending}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Total Fees</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">${stats.totalFees.toFixed(2)}</p>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-white rounded-lg p-4 mb-6 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by currency or reference..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Date Range */}
            <div className="relative">
              <Calendar className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="90days">Last 90 Days</option>
                <option value="all">All Time</option>
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Conversions Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">From / To</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">From Amount</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">To Amount</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Exchange Rate</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Fee</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Reference</th>
                </tr>
              </thead>
              <tbody>
                {filteredConversions.length > 0 ? (
                  filteredConversions.map((conv) => (
                    <tr key={conv.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{conv.fromCurrency}</span>
                          <ArrowRightLeft className="w-4 h-4 text-gray-400" />
                          <span className="font-semibold text-gray-900">{conv.toCurrency}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        {conv.fromAmount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        {conv.toAmount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">
                        {conv.exchangeRate.toFixed(6)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">
                        ${conv.fees.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full font-medium text-xs ${getStatusColor(conv.status)}`}>
                          {conv.status.charAt(0).toUpperCase() + conv.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(conv.createdAt).toLocaleDateString()} <br />
                        <span className="text-xs text-gray-500">{new Date(conv.createdAt).toLocaleTimeString()}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm text-gray-600 font-mono">{conv.reference}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      No conversions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Convert Now Button */}
        <div className="mt-6 text-center">
          <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 mx-auto">
            <ArrowRightLeft className="w-5 h-5" />
            Convert Currency Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default Conversions;
