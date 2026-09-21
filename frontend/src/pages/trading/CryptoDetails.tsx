import React, { useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Calendar, Info } from 'lucide-react';
import type { CryptoCurrency, CryptoPrice } from '../../types/financial';

interface PricePoint {
  week: string;
  price: number;
}

const mockChartData: PricePoint[] = [
  { week: 'Week 01', price: 200 },
  { week: 'Week 02', price: 300 },
  { week: 'Week 03', price: 280 },
  { week: 'Week 04', price: 400 },
  { week: 'Week 05', price: 350 },
  { week: 'Week 06', price: 500 },
  { week: 'Week 07', price: 480 },
  { week: 'Week 08', price: 600 },
  { week: 'Week 09', price: 580 },
  { week: 'Week 10', price: 750 },
];

const sellOrders = [
  { price: 82.3, amount: 0.15, total: 133.12 },
  { price: 83.9, amount: 0.18, total: 237.31 },
  { price: 84.2, amount: 0.25, total: 252.58 },
  { price: 86.2, amount: 0.35, total: 126.26 },
  { price: 91.6, amount: 0.75, total: 46.92 },
];

const buyOrders = [
  { price: 86.2, amount: 0.35, total: 126.26 },
  { price: 86.2, amount: 0.55, total: 212.56 },
  { price: 93.9, amount: 0.55, total: 212.56 },
  { price: 92.6, amount: 0.21, total: 123.27 },
  { price: 93.9, amount: 0.55, total: 212.56 },
  { price: 94.2, amount: 0.18, total: 129.26 },
];

interface CryptoCoin {
  symbol: CryptoCurrency;
  name: string;
  about: string;
  price: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
  marketCapUSD: number;
}

const ethereumData: CryptoCoin = {
  symbol: 'ETH',
  name: 'Ethereum',
  about: `Launched in 2015, it is an open-source, blockchain-based,
decentralized software platform used for its own cryptocurrency, either.
It enables SmartContracts and distributed applications (ÐApps)
to be built and run without any downtime,
fraud, control, or interference from a third party.`,
  price: 11898.15,
  priceChange24h: 1.64,
  marketCap: 219.248,
  volume24h: 47.228,
  marketCapUSD: 219248000000,
};

export const CryptoDetails: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'about' | 'sell' | 'buy'>('about');
  const [selectedPrice, setSelectedPrice] = useState<string>('');
  const [selectedAmount, setSelectedAmount] = useState<string>('');
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | '1y'>('7d');

  const handleBuy = () => {
    console.log('Buy order:', { price: selectedPrice, amount: selectedAmount });
  };

  const handleSell = () => {
    console.log('Sell order:', { price: selectedPrice, amount: selectedAmount });
  };

  return (
    <div className="w-full h-full bg-gray-50 rounded-lg overflow-auto">
      {/* Header with Crypto Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center gap-6 px-6 py-4">
          {['BTC', 'ETH', 'Monero', 'Litcoin'].map((coin) => (
            <button
              key={coin}
              className={`text-sm font-medium pb-2 border-b-2 transition ${
                coin === 'ETH'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              ◉ {coin}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        {/* Left Column - About & Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Coin Header */}
          <div className="bg-white rounded-lg p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-3xl">Ξ</span>
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{ethereumData.name}</h1>
                <p className="text-gray-600 text-sm">{ethereumData.symbol}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-gray-900">${ethereumData.price.toLocaleString()}</p>
                <p className={`text-sm font-semibold ${ethereumData.priceChange24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {ethereumData.priceChange24h >= 0 ? '▲' : '▼'} {ethereumData.priceChange24h}%
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 mb-4">
              <div className="flex gap-6">
                {['About', 'Sell Order', 'Buy Order'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab.toLowerCase().replace(' ', '_') as any)}
                    className={`pb-3 border-b-2 font-medium transition ${
                      (tab === 'About' && activeTab === 'about') ||
                      (tab === 'Sell Order' && activeTab === 'sell') ||
                      (tab === 'Buy Order' && activeTab === 'buy')
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'about' && (
              <div className="space-y-4">
                <div className="flex items-start gap-2">
                  <Info className="w-5 h-5 text-gray-400 mt-1 flex-shrink-0" />
                  <p className="text-gray-700 text-sm leading-relaxed">{ethereumData.about}</p>
                </div>
              </div>
            )}

            {activeTab === 'sell' && (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">Price</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">Amount</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellOrders.map((order, idx) => (
                        <tr key={idx} className={`border-b border-gray-200 ${idx === 1 ? 'bg-blue-50' : ''}`}>
                          <td className="px-4 py-3 text-gray-900 font-medium">{order.price}</td>
                          <td className="px-4 py-3 text-gray-900">{order.amount}</td>
                          <td className="px-4 py-3 text-gray-900">${order.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'buy' && (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">Price</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">Amount</th>
                        <th className="px-4 py-2 text-left font-semibold text-gray-700">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buyOrders.map((order, idx) => (
                        <tr key={idx} className={`border-b border-gray-200 ${idx === 4 ? 'bg-blue-50' : ''}`}>
                          <td className="px-4 py-3 text-gray-900 font-medium">{order.price}</td>
                          <td className="px-4 py-3 text-gray-900">{order.amount}</td>
                          <td className="px-4 py-3 text-gray-900">${order.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Coin Chart */}
          <div className="bg-white rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Coin Chart</h2>
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  {(['4 June 2020 – 17 June 2020'] as const).map((period) => (
                    <button key={period} className="text-xs text-blue-600 font-medium hover:text-blue-700">
                      {period}
                    </button>
                  ))}
                </div>
                <select className="text-sm border border-gray-300 rounded px-3 py-1 text-gray-700">
                  <option>USD ($ US Dollar)</option>
                </select>
              </div>
            </div>

            {/* Chart Metrics */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 rounded p-4">
                <p className="text-gray-600 text-xs uppercase font-semibold mb-1">Price</p>
                <p className="text-xl font-bold text-gray-900">${ethereumData.price.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 rounded p-4">
                <p className="text-gray-600 text-xs uppercase font-semibold mb-1">24H Change</p>
                <p className="text-xl font-bold text-green-600">▲ 1.64%</p>
              </div>
              <div className="bg-gray-50 rounded p-4">
                <p className="text-gray-600 text-xs uppercase font-semibold mb-1">Volume (24h)</p>
                <p className="text-lg font-bold text-gray-900">${ethereumData.volume24h}B</p>
              </div>
              <div className="bg-gray-50 rounded p-4">
                <p className="text-gray-600 text-xs uppercase font-semibold mb-1">Market Cap</p>
                <p className="text-lg font-bold text-gray-900">${ethereumData.marketCap}B</p>
              </div>
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mockChartData}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="week" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorPrice)"
                  dot={{ fill: '#3b82f6', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Column - Quick Trade */}
        <div className="space-y-6">
          {/* Quick Trade Card */}
          <div className="bg-white rounded-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-6">Quick Trade</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Amount BTC</label>
                <input
                  type="number"
                  value={selectedAmount}
                  onChange={(e) => setSelectedAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Price BPL</label>
                <input
                  type="number"
                  value={selectedPrice}
                  onChange={(e) => setSelectedPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fee (%)</label>
                <div className="px-4 py-2 bg-gray-50 rounded-lg text-gray-600">0.00%</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Total BPL</label>
                <div className="px-4 py-2 bg-gray-50 rounded-lg text-gray-600">0.00</div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <button
                  onClick={handleBuy}
                  className="py-3 bg-green-500 text-white font-semibold rounded-full hover:bg-green-600 transition flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-5 h-5" />
                  BUY
                </button>
                <button
                  onClick={handleSell}
                  className="py-3 bg-red-500 text-white font-semibold rounded-full hover:bg-red-600 transition flex items-center justify-center gap-2"
                >
                  <TrendingDown className="w-5 h-5" />
                  SELL
                </button>
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="bg-white rounded-lg p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Market Cap</span>
                <span className="font-semibold text-gray-900">${ethereumData.marketCap}B</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">24h Volume</span>
                <span className="font-semibold text-gray-900">${ethereumData.volume24h}B</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">24h Change</span>
                <span className="font-semibold text-green-600">+{ethereumData.priceChange24h}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CryptoDetails;
