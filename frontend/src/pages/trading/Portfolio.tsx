import React, { useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MoreVertical, Mail, Phone, Facebook, Camera, TrendingUp } from 'lucide-react';

interface HoldingData {
  symbol: string;
  name: string;
  icon: string;
  value: number;
  change: number;
  isPositive: boolean;
}

interface ActivityData {
  id: string;
  type: 'deposit' | 'withdraw';
  action: string;
  time: string;
  amount: string;
  status: 'completed' | 'pending' | 'failed';
}

const holdings: HoldingData[] = [
  { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ', value: 168331.09, change: 45, isPositive: true },
  { symbol: 'LTC', name: 'LiteCoin', icon: 'Ł', value: 667224, change: -45, isPositive: false },
  { symbol: 'BTC', name: 'BitCoin', icon: '₿', value: 24098, change: 45, isPositive: true },
  { symbol: 'XMR', name: 'Monero', icon: 'ⓜ', value: 18783.33, change: 40, isPositive: true },
];

const weeklyData = [
  { day: 'Sun', successful: 30, failed: 10, waiting: 5 },
  { day: 'Mon', successful: 35, failed: 12, waiting: 8 },
  { day: 'Tue', successful: 42, failed: 15, waiting: 6 },
  { day: 'Wed', successful: 38, failed: 10, waiting: 7 },
  { day: 'Thu', successful: 50, failed: 18, waiting: 9 },
  { day: 'Fri', successful: 45, failed: 14, waiting: 5 },
  { day: 'Sat', successful: 55, failed: 16, waiting: 8 },
];

const recentActivity: ActivityData[] = [
  { id: '1', type: 'deposit', action: 'Topup', time: '06:24:45 AM', amount: '+55.553', status: 'completed' },
  { id: '2', type: 'withdraw', action: 'Withdraw', time: '06:24:45 AM', amount: '-$542', status: 'pending' },
  { id: '3', type: 'withdraw', action: 'Withdraw', time: '06:24:45 AM', amount: '-$912', status: 'failed' },
  { id: '4', type: 'deposit', action: 'Topup', time: '06:24:45 AM', amount: '+$7,762', status: 'completed' },
  { id: '5', type: 'deposit', action: 'Topup', time: '06:24:45 AM', amount: '+55.553', status: 'completed' },
  { id: '6', type: 'withdraw', action: 'Withdraw', time: '06:24:45 AM', amount: '-$912', status: 'failed' },
];

const COLORS = ['#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6'];

export const Portfolio: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'monthly' | 'weekly' | 'today'>('monthly');

  const allocationData = [
    { name: 'Ethereum', value: 40 },
    { name: 'BitCoin', value: 25 },
    { name: 'Monero', value: 20 },
    { name: 'LiteCoin', value: 15 },
  ];

  return (
    <div className="w-full h-full bg-gray-50 rounded-lg overflow-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Portfolio</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Medium, IDN</span>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              Filter Period
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Holdings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Coin Holdings */}
          <div className="bg-white rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">Coin Holding</h2>
              <button className="text-gray-500 hover:text-gray-700">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {holdings.map((holding) => (
                <div key={holding.symbol} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-lg font-bold text-blue-600">
                        {holding.icon}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{holding.name}</p>
                        <p className="text-xs text-gray-600">{holding.symbol}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-2xl font-bold text-gray-900">${holding.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                    <p className={`text-sm font-semibold ${holding.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {holding.isPositive ? '↑' : '↓'} {holding.change}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Summary */}
          <div className="bg-white rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Weekly Summary</h2>
              <div className="flex gap-2">
                {(['Monthly', 'Weekly', 'Today'] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setActiveTab(period.toLowerCase() as any)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${
                      activeTab === period.toLowerCase()
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex gap-6 mb-4">
              {[
                { label: 'Successful Market', color: 'bg-green-500' },
                { label: 'Failed', color: 'bg-orange-500' },
                { label: 'Waiting', color: 'bg-gray-500' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                  <span className="text-xs text-gray-600">{item.label}</span>
                </div>
              ))}
            </div>

            {/* Bar Chart */}
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <Tooltip />
                <Bar dataKey="successful" fill="#10b981" />
                <Bar dataKey="failed" fill="#f97316" />
                <Bar dataKey="waiting" fill="#d1d5db" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h2>
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                        activity.type === 'deposit' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    >
                      {activity.type === 'deposit' ? '↑' : '↓'}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{activity.action}</p>
                      <p className="text-xs text-gray-600">{activity.time}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-semibold ${
                        activity.type === 'deposit' ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {activity.amount}
                    </p>
                    <p className={`text-xs font-medium ${
                      activity.status === 'completed'
                        ? 'text-green-600'
                        : activity.status === 'pending'
                          ? 'text-yellow-600'
                          : 'text-red-600'
                    }`}>
                      {activity.status.charAt(0).toUpperCase() + activity.status.slice(1)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Profile & Charts */}
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="bg-white rounded-lg p-6">
            <div className="relative mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full mx-auto flex items-center justify-center text-white text-3xl font-bold">
                WF
              </div>
              <button className="absolute bottom-0 right-1/2 translate-x-1/2 translate-y-0 bg-white border border-gray-300 rounded-full p-2 hover:bg-gray-50">
                <Camera className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">William Fancyson</h3>
              <p className="text-sm text-gray-600">@williamfancyson</p>
              <p className="text-xs text-gray-500 mt-2">Join on 24 March 2017</p>
            </div>

            <p className="text-xs text-gray-600 text-center mb-6 leading-relaxed">
              Lorem dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore
            </p>

            <div className="flex justify-center gap-4 mb-6">
              <button className="text-blue-600 hover:text-blue-700">
                <Phone className="w-5 h-5" />
              </button>
              <button className="text-blue-600 hover:text-blue-700">
                <Mail className="w-5 h-5" />
              </button>
              <button className="text-blue-600 hover:text-blue-700">
                <Facebook className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Current Graphs */}
          <div className="bg-white rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Current Graph</h3>
              <button className="text-gray-500 hover:text-gray-700">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={allocationData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {allocationData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="mt-4 space-y-2 text-xs">
              {['Ethereum', 'BitCoin', 'Monero', 'LiteCoin'].map((coin, idx) => (
                <div key={coin} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx] }}></div>
                  <span className="text-gray-700">{coin}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Current Graph 2 */}
          <div className="bg-white rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Current Graph</h3>
              <button className="text-gray-500 hover:text-gray-700">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>

            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyData.slice(0, 5)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                <Tooltip />
                <Bar dataKey="successful" fill="#f59e0b" />
                <Bar dataKey="failed" fill="#06b6d4" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Portfolio;
