import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface MarketOverviewProps {
  title?: string;
  subtitle?: string;
}

const MarketOverview: React.FC<MarketOverviewProps> = ({ 
  title = "Market Overview",
  subtitle = "Lorem ipsum dolor sit amet consectetur"
}) => {
  // Sample data for the chart
  const data = [
    { week: 'Week 01', ETH: 300, BTC: 450 },
    { week: 'Week 02', ETH: 280, BTC: 420 },
    { week: 'Week 03', ETH: 290, BTC: 430 },
    { week: 'Week 04', ETH: 260, BTC: 380 },
    { week: 'Week 05', ETH: 240, BTC: 360 },
    { week: 'Week 06', ETH: 220, BTC: 340 },
    { week: 'Week 07', ETH: 200, BTC: 320 },
    { week: 'Week 08', ETH: 180, BTC: 280 },
    { week: 'Week 09', ETH: 190, BTC: 300 },
    { week: 'Week 10', ETH: 160, BTC: 260 },
  ];

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-semibold text-gray-800">{payload[0].payload.week}</p>
          <p className="text-sm text-blue-600">ETH: ${payload[0].value}k</p>
          <p className="text-sm text-orange-600">BTC: ${payload[1].value}k</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="col-span-1 lg:col-span-2 bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 flex items-center gap-1">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            ETH
          </button>
          <button className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 flex items-center gap-1">
            <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
            AXE
          </button>
          <button className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            LTC
          </button>
          <button className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 flex items-center gap-1">
            <span className="w-2 h-2 bg-pink-500 rounded-full"></span>
            XMR
          </button>
          <select className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">
            <option>Weekly (2020)</option>
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
            tickFormatter={(value) => `${value}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            iconType="circle"
            wrapperStyle={{ paddingTop: '20px' }}
          />
          <Line 
            type="monotone" 
            dataKey="ETH" 
            stroke="#3b82f6" 
            strokeWidth={3}
            dot={{ r: 4, fill: '#3b82f6' }}
            activeDot={{ r: 6 }}
          />
          <Line 
            type="monotone" 
            dataKey="BTC" 
            stroke="#f97316" 
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MarketOverview;
