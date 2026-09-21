import { useState } from 'react';
import { Search, Filter, Calendar, TrendingUp, TrendingDown, ChevronDown } from 'lucide-react';
import type { Trade } from '../../types/financial';

const History = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'buy' | 'sell'>('all');
  const [dateRange, setDateRange] = useState('30days');

  // Mock data
  const trades: Trade[] = [
    {
      id: '1',
      orderId: '1',
      userId: 'user1',
      type: 'buy',
      pair: 'BTC/USD',
      fromCurrency: 'USD',
      toCurrency: 'BTC',
      amount: 0.5,
      price: 45000,
      fees: 22.50,
      total: 22500,
      executedAt: '2024-01-15T10:35:00Z'
    },
    {
      id: '2',
      orderId: '2',
      userId: 'user1',
      type: 'sell',
      pair: 'ETH/USD',
      fromCurrency: 'ETH',
      toCurrency: 'USD',
      amount: 1.5,
      price: 2500,
      fees: 37.50,
      total: 3750,
      executedAt: '2024-01-14T14:25:00Z'
    },
    {
      id: '3',
      orderId: '4',
      userId: 'user1',
      type: 'buy',
      pair: 'XRP/USD',
      fromCurrency: 'USD',
      toCurrency: 'XRP',
      amount: 500,
      price: 2.5,
      fees: 62.50,
      total: 1312.50,
      executedAt: '2024-01-13T09:10:00Z'
    },
    {
      id: '4',
      orderId: '5',
      userId: 'user1',
      type: 'sell',
      pair: 'BTC/USD',
      fromCurrency: 'BTC',
      toCurrency: 'USD',
      amount: 0.25,
      price: 44800,
      fees: 28.00,
      total: 11200,
      executedAt: '2024-01-12T16:45:00Z'
    },
    {
      id: '5',
      orderId: '6',
      userId: 'user1',
      type: 'buy',
      pair: 'SOL/USD',
      fromCurrency: 'USD',
      toCurrency: 'SOL',
      amount: 5,
      price: 150,
      fees: 37.50,
      total: 787.50,
      executedAt: '2024-01-11T11:20:00Z'
    },
    {
      id: '6',
      orderId: '7',
      userId: 'user1',
      type: 'buy',
      pair: 'ADA/USD',
      fromCurrency: 'USD',
      toCurrency: 'ADA',
      amount: 100,
      price: 1.0,
      fees: 5.00,
      total: 105.00,
      executedAt: '2024-01-10T08:30:00Z'
    }
  ];

  const filteredTrades = trades
    .filter(trade => {
      const matchesSearch = trade.pair.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || trade.type === filterType;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());

  const calculateStats = () => {
    const buyTrades = filteredTrades.filter(t => t.type === 'buy');
    const sellTrades = filteredTrades.filter(t => t.type === 'sell');
    
    return {
      totalTrades: filteredTrades.length,
      buys: buyTrades.length,
      sells: sellTrades.length,
      totalValue: filteredTrades.reduce((sum, t) => sum + t.total, 0),
      totalFees: filteredTrades.reduce((sum, t) => sum + t.fees, 0)
    };
  };

  const stats = calculateStats();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Trade History</h1>
          <p className="text-gray-600 mt-1">View all your completed trades</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Total Trades</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalTrades}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Buy Orders</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{stats.buys}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Sell Orders</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{stats.sells}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Total Fees Paid</p>
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
                placeholder="Search by trading pair..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Type Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'all' | 'buy' | 'sell')}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="all">All Types</option>
                <option value="buy">Buy Orders</option>
                <option value="sell">Sell Orders</option>
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

        {/* Trades Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Trading Pair</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Amount</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Price</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Total</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Fee</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Executed</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.length > 0 ? (
                  filteredTrades.map((trade) => (
                    <tr key={trade.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm">
                        <span className="font-semibold text-gray-900">{trade.pair}</span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          {trade.type === 'buy' ? (
                            <TrendingUp className="w-4 h-4 text-green-600" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-600" />
                          )}
                          <span className={`capitalize font-medium ${trade.type === 'buy' ? 'text-green-600' : 'text-red-600'}`}>
                            {trade.type}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        {trade.amount.toFixed(4)} {trade.toCurrency}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">
                        ${trade.price.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        ${trade.total.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">
                        ${trade.fees.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(trade.executedAt).toLocaleDateString()} <br />
                        <span className="text-xs text-gray-500">{new Date(trade.executedAt).toLocaleTimeString()}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button className="text-blue-600 hover:text-blue-800 font-medium text-sm">View</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      No trades found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default History;
