import { useState } from 'react';
import { Search, Filter, TrendingUp, TrendingDown, BarChart3, ChevronDown, Plus } from 'lucide-react';
import type { InvestmentTransaction } from '../../types/financial';

const Trades = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'buy' | 'sell' | 'dividend'>('all');
  const [sortBy, setSortBy] = useState('date');

  // Mock data
  const trades: InvestmentTransaction[] = [
    {
      id: '1',
      userId: 'user1',
      portfolioId: 'port1',
      type: 'buy',
      assetType: 'crypto',
      symbol: 'BTC',
      quantity: 0.5,
      price: 45000,
      totalAmount: 22500,
      fees: 112.50,
      netAmount: 22387.50,
      date: '2024-01-15T10:30:00Z',
      createdAt: '2024-01-15T10:30:00Z'
    },
    {
      id: '2',
      userId: 'user1',
      portfolioId: 'port1',
      type: 'sell',
      assetType: 'stock',
      symbol: 'AAPL',
      quantity: 10,
      price: 190,
      totalAmount: 1900,
      fees: 19,
      netAmount: 1881,
      date: '2024-01-14T14:20:00Z',
      createdAt: '2024-01-14T14:20:00Z'
    },
    {
      id: '3',
      userId: 'user1',
      portfolioId: 'port1',
      type: 'dividend',
      assetType: 'stock',
      symbol: 'MSFT',
      quantity: 25,
      price: 8.75,
      totalAmount: 218.75,
      fees: 0,
      netAmount: 218.75,
      date: '2024-01-13T09:00:00Z',
      createdAt: '2024-01-13T09:00:00Z'
    },
    {
      id: '4',
      userId: 'user1',
      portfolioId: 'port1',
      type: 'buy',
      assetType: 'etf',
      symbol: 'SPY',
      quantity: 5,
      price: 470,
      totalAmount: 2350,
      fees: 47,
      netAmount: 2303,
      date: '2024-01-12T11:45:00Z',
      createdAt: '2024-01-12T11:45:00Z'
    },
    {
      id: '5',
      userId: 'user1',
      portfolioId: 'port1',
      type: 'buy',
      assetType: 'mutual_fund',
      symbol: 'VTSAX',
      quantity: 100,
      price: 125,
      totalAmount: 12500,
      fees: 125,
      netAmount: 12375,
      date: '2024-01-11T08:30:00Z',
      createdAt: '2024-01-11T08:30:00Z'
    },
    {
      id: '6',
      userId: 'user1',
      portfolioId: 'port1',
      type: 'sell',
      assetType: 'bond',
      symbol: 'TLT',
      quantity: 20,
      price: 92,
      totalAmount: 1840,
      fees: 18.40,
      netAmount: 1821.60,
      date: '2024-01-10T15:20:00Z',
      createdAt: '2024-01-10T15:20:00Z'
    }
  ];

  const filteredTrades = trades
    .filter(trade => {
      const matchesSearch = trade.symbol.includes(searchTerm.toUpperCase());
      const matchesType = filterType === 'all' || trade.type === filterType;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      if (sortBy === 'date') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortBy === 'amount') return b.totalAmount - a.totalAmount;
      return 0;
    });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'buy':
        return 'bg-green-100 text-green-800';
      case 'sell':
        return 'bg-red-100 text-red-800';
      case 'dividend':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getAssetTypeIcon = (assetType: string) => {
    switch (assetType) {
      case 'crypto':
        return '₿';
      case 'stock':
        return '📈';
      case 'bond':
        return '📊';
      case 'etf':
        return '🌐';
      case 'mutual_fund':
        return '💼';
      default:
        return '💰';
    }
  };

  const calculateStats = () => {
    return {
      totalTrades: filteredTrades.length,
      buys: filteredTrades.filter(t => t.type === 'buy').length,
      sells: filteredTrades.filter(t => t.type === 'sell').length,
      totalValue: filteredTrades.reduce((sum, t) => sum + t.totalAmount, 0),
      totalFees: filteredTrades.reduce((sum, t) => sum + t.fees, 0)
    };
  };

  const stats = calculateStats();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Trades</h1>
            <p className="text-gray-600 mt-1">Manage your investment transactions</p>
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2">
            <Plus className="w-5 h-5" />
            New Trade
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
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
            <p className="text-gray-600 text-sm">Total Value</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">${(stats.totalValue / 1000).toFixed(1)}k</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Total Fees</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">${stats.totalFees.toFixed(2)}</p>
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
                placeholder="Search by symbol..."
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
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="all">All Types</option>
                <option value="buy">Buy Orders</option>
                <option value="sell">Sell Orders</option>
                <option value="dividend">Dividends</option>
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
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Symbol</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Quantity</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Price</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Total Amount</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Fees</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Net Amount</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.length > 0 ? (
                  filteredTrades.map((trade) => (
                    <tr key={trade.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getAssetTypeIcon(trade.assetType)}</span>
                          <span className="font-semibold text-gray-900">{trade.symbol}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full font-medium text-xs ${getTypeColor(trade.type)}`}>
                          {trade.type === 'buy' && <TrendingUp className="w-3 h-3 inline mr-1" />}
                          {trade.type === 'sell' && <TrendingDown className="w-3 h-3 inline mr-1" />}
                          {trade.type === 'dividend' && <BarChart3 className="w-3 h-3 inline mr-1" />}
                          {trade.type.charAt(0).toUpperCase() + trade.type.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        {trade.quantity.toFixed(4)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">
                        ${trade.price.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        ${trade.totalAmount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-600">
                        ${trade.fees.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        ${trade.netAmount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(trade.date).toLocaleDateString()} <br />
                        <span className="text-xs text-gray-500">{new Date(trade.date).toLocaleTimeString()}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button className="text-blue-600 hover:text-blue-800 font-medium text-sm">View</button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
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

export default Trades;
