import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { X, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import type { Stock } from '../../types/investments/investments';

interface StockDetailViewProps {
  stock: Stock;
  isOpen: boolean;
  onClose: () => void;
}

// Generate mock historical price data
const generateMockPriceHistory = (stock: Stock) => {
  const currentDate = new Date();
  const data = [];
  
  // Generate 30 days of data
  for (let i = 29; i >= 0; i--) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - i);
    
    // Create realistic price movements
    const volatility = stock.currentPrice * 0.02; // 2% volatility
    const trend = (stock.currentPrice - stock.purchasePrice) / 30;
    const randomChange = (Math.random() - 0.5) * volatility * 2;
    const price = stock.purchasePrice + trend * (30 - i) + randomChange;
    
    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dateObj: date,
      price: Math.max(price, stock.purchasePrice * 0.95), // Don't go too low
      high: price + volatility,
      low: price - volatility,
    });
  }
  
  return data;
};

const StockDetailView: React.FC<StockDetailViewProps> = ({ stock, isOpen, onClose }) => {
  const [timeRange, setTimeRange] = useState<'1M' | '3M' | '6M' | '1Y'>('1M');
  
  // Generate mock historical data
  const priceHistory = useMemo(() => generateMockPriceHistory(stock), [stock]);
  
  // Filter data based on time range
  const filteredData = useMemo(() => {
    const rangeMap = {
      '1M': 30,
      '3M': 90,
      '6M': 180,
      '1Y': 365,
    };
    const days = rangeMap[timeRange];
    return priceHistory.slice(Math.max(0, priceHistory.length - days));
  }, [priceHistory, timeRange]);

  const getSymbolColor = (symbol: string) => {
    const colorMap: Record<string, string> = {
      AAPL: 'from-blue-50 to-blue-100',
      GOOGL: 'from-red-50 to-red-100',
      MSFT: 'from-cyan-50 to-cyan-100',
      TSLA: 'from-purple-50 to-purple-100',
    };
    return colorMap[symbol] || 'from-gray-50 to-gray-100';
  };

  const getBgBadgeColor = (symbol: string) => {
    const colorMap: Record<string, string> = {
      AAPL: 'bg-blue-100 text-blue-700',
      GOOGL: 'bg-red-100 text-red-700',
      MSFT: 'bg-cyan-100 text-cyan-700',
      TSLA: 'bg-purple-100 text-purple-700',
    };
    return colorMap[symbol] || 'bg-gray-100 text-gray-700';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="flex items-center justify-center min-h-screen p-4">
        <div
          className="bg-white rounded-lg shadow-xl w-full max-w-2xl transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`bg-gradient-to-r ${getSymbolColor(stock.symbol)} p-6 border-b border-gray-200`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-lg flex items-center justify-center text-lg font-bold ${getBgBadgeColor(stock.symbol)}`}>
                  {stock.symbol}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{stock.name}</h2>
                  <p className="text-sm text-gray-600">{stock.symbol}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Purchased on {new Date(stock.purchaseDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-600 mb-1">Current Price</p>
                <p className="text-xl font-bold text-gray-900">
                  ${stock.currentPrice.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-600 mb-1">Purchase Price</p>
                <p className="text-xl font-bold text-gray-900">
                  ${stock.purchasePrice.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-600 mb-1">Quantity</p>
                <p className="text-xl font-bold text-gray-900">{stock.quantity} shares</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-600 mb-1">Total Value</p>
                <p className="text-xl font-bold text-gray-900">
                  ${stock.totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Gain/Loss Summary */}
            <div className={`border rounded-lg p-4 ${stock.gainLoss >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-medium ${stock.gainLoss >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    Gain/Loss
                  </p>
                  <p className={`text-2xl font-bold mt-1 ${stock.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stock.gainLoss >= 0 ? '+' : '-'}
                    ${Math.abs(stock.gainLoss).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {stock.gainLossPercent >= 0 ? (
                      <TrendingUp className={`w-5 h-5 ${stock.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                    ) : (
                      <TrendingDown className={`w-5 h-5 ${stock.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                    )}
                    <span className={`text-2xl font-bold ${stock.gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {stock.gainLossPercent >= 0 ? '+' : ''}
                      {stock.gainLossPercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Time Range Selector */}
            <div className="flex gap-2">
              {(['1M', '3M', '6M', '1Y'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    timeRange === range
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            {/* Price Chart */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <p className="text-sm font-medium text-gray-700">Price History ({timeRange})</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={filteredData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      stroke="#9ca3af"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="#9ca3af"
                      domain={['dataMin - 10', 'dataMax + 10']}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                      }}
                      formatter={(value: any) => `$${parseFloat(value).toFixed(2)}`}
                      labelStyle={{ color: '#374151' }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="line"
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#2563eb"
                      dot={false}
                      strokeWidth={2}
                      isAnimationActive={false}
                      name="Stock Price"
                    />
                    <Line
                      type="monotone"
                      dataKey="high"
                      stroke="#10b981"
                      dot={false}
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      isAnimationActive={false}
                      name="High"
                    />
                    <Line
                      type="monotone"
                      dataKey="low"
                      stroke="#ef4444"
                      dot={false}
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      isAnimationActive={false}
                      name="Low"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Additional Details */}
            <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
              <div>
                <p className="text-xs font-medium text-gray-600">Investment Date</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                  {new Date(stock.purchaseDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600">Days Held</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                  {Math.floor(
                    (new Date().getTime() - new Date(stock.purchaseDate).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )}{' '}
                  days
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 rounded-b-lg border-t border-gray-200 p-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition"
            >
              Close
            </button>
            <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">
              Trade Stock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockDetailView;
