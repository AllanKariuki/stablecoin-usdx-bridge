import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface DataItem {
  name: string;
  amount: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DataItem[];
  title?: string;
}

const DonutChart: React.FC<DonutChartProps> = ({ data, title = "Current Statistic" }) => {
  const COLORS = data.map(item => {
    if (item.color.includes('orange')) return '#f97316';
    if (item.color.includes('blue')) return '#3b82f6';
    if (item.color.includes('green')) return '#10b981';
    if (item.color.includes('pink')) return '#ec4899';
    return '#6b7280';
  });

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <h2 className="text-lg font-bold text-gray-800 mb-6">{title}</h2>
      
      {/* Donut Chart */}
      <div className="flex items-center justify-center mb-6">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="space-y-3">
        {data.map((item, index) => (
          <div key={index} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className={`w-3 h-3 rounded-full`}
                style={{ backgroundColor: COLORS[index] }}
              ></div>
              <span className="text-sm text-gray-700">{item.name}</span>
            </div>
            <span className="text-sm font-semibold text-gray-800">{item.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DonutChart;
