import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface PortfolioChartProps {
  timeRange: string;
  setTimeRange: (range: string) => void;
}

const PortfolioChart: React.FC<PortfolioChartProps> = ({ timeRange, setTimeRange }) => {
  // Sample data for USDX-ETH and USDX-SOL
  const data = [
    { week: 'Week 01', ETH: 1800, SOL: 2200 },
    { week: 'Week 02', ETH: 1850, SOL: 2350 },
    { week: 'Week 03', ETH: 1900, SOL: 2500 },
    { week: 'Week 04', ETH: 1780, SOL: 2180 },
    { week: 'Week 05', ETH: 1920, SOL: 2600 },
    { week: 'Week 06', ETH: 2000, SOL: 2750 },
    { week: 'Week 07', ETH: 1950, SOL: 2550 },
    { week: 'Week 08', ETH: 2100, SOL: 2900 },
    { week: 'Week 09', ETH: 2050, SOL: 2700 },
    { week: 'Week 10', ETH: 2150, SOL: 3000 },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-semibold text-gray-800">{payload[0].payload.week}</p>
          <p className="text-sm text-blue-600">USDX-ETH: ${payload[0].value}</p>
          <p className="text-sm text-purple-600">USDX-SOL: ${payload[1].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Portfolio Value</h2>
          <p className="text-sm text-gray-500">Track your portfolio performance over time</p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 flex items-center gap-1">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            USDX-ETH
          </button>
          <button className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 flex items-center gap-1">
            <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
            USDX-SOL
          </button>
          <select 
            className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <option value="1D">1 Day</option>
            <option value="7D">7 Days</option>
            <option value="30D">30 Days</option>
            <option value="90D">90 Days</option>
            <option value="1Y">1 Year</option>
            <option value="All">All Time</option>
          </select>
        </div>
      </div>
      
      {/* Chart Area */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis 
            dataKey="week" 
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            iconType="circle"
            wrapperStyle={{ paddingTop: '20px' }}
          />
          <Line 
            type="monotone" 
            dataKey="ETH" 
            name="USDX-ETH"
            stroke="#3b82f6" 
            strokeWidth={3}
            dot={{ r: 4, fill: '#3b82f6' }}
            activeDot={{ r: 6 }}
          />
          <Line 
            type="monotone" 
            dataKey="SOL" 
            name="USDX-SOL"
            stroke="#9333ea" 
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PortfolioChart;
