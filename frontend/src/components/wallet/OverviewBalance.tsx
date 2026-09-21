import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartDataPoint {
  day: string;
  value: number;
}

interface OverviewBalanceProps {
  current: string;
  change: string;
  lastWeek: string;
  chartData: ChartDataPoint[];
  timeRange: string;
  onTimeRangeChange: (value: string) => void;
  subtitle?: string;
}

const OverviewBalance: React.FC<OverviewBalanceProps> = ({
  current,
  change,
  lastWeek,
  chartData,
  // timeRange,
  // onTimeRangeChange,
  subtitle = 'Lorem ipsum dolor sit amet, consectetur'
}) => {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Overview Balance</h2>
          <p className="text-sm text-gray-300">{subtitle}</p>
        </div>
        {/* <select
          value={timeRange}
          onChange={(e) => onTimeRangeChange(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="Monthly">Monthly</option>
          <option value="Weekly">Weekly</option>
          <option value="Daily">Daily</option>
        </select> */}
        <div className="flex gap-1 bg-white rounded-full border border-gray-200 p-1">
            <button className="px-6 py-2 text-sm text-gray-600 rounded-full hover:bg-white transition-colors">Monthly</button>
            <button className="px-6 py-2 text-sm text-gray-600 rounded-full hover:bg-white transition-colors">Weekly</button>
            <button className="px-6 py-2 text-sm bg-blue-600 text-white rounded-full font-medium">Today</button>
          </div>
      </div>
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <h3 className="text-3xl font-bold text-gray-900">{current}</h3>
          <span className="text-green-600 font-semibold">{change}</span>
        </div>
        <p className="text-sm text-gray-500 mt-1">Last Week {lastWeek}</p>
      </div>
      
      {/* Chart using Recharts */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis 
              dataKey="day" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9ca3af', fontSize: 12 }}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9ca3af', fontSize: 12 }}
              tickFormatter={(value) => `${value / 1000}k`}
            />
            <Tooltip 
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
              formatter={(value: number) => [`$${value}`, 'Balance']}
            />
            <Bar 
              dataKey="value" 
              fill="#3b82f6" 
              radius={[4, 4, 0, 0]}
              maxBarSize={10}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default OverviewBalance;
