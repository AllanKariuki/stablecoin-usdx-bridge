import React from 'react';
import { MoreVertical, ChevronDown } from 'lucide-react';

interface Order {
  price: number;
  amount: number;
  total: number;
}

interface OrderBookProps {
  title: string;
  coinName: string;
  coinSymbol: string;
  orders: Order[];
  highlightIndex?: number;
}

const OrderBook: React.FC<OrderBookProps> = ({
  title,
  coinName,
  coinSymbol,
  orders,
  highlightIndex = 4,
}) => {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        </div>
        <MoreVertical className="w-5 h-5 text-gray-400 cursor-pointer" />
      </div>
      
      {/* Dropdown */}
      <div className="mb-4">
        <button className="w-full flex items-center justify-between px-4 py-2 bg-gray-100 rounded-2xl hover:bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-md">{coinSymbol}</span>
            <span className="text-md">{coinName}</span>
          </div>
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Table Headers */}
      <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 mb-2 pb-2">
        <span>Price</span>
        <span>Amount</span>
        <span>Total</span>
      </div>

      {/* Orders */}
      <div className="space-y-2">
        {orders.map((order, i) => (
          <div
            key={i}
            className={`grid grid-cols-3 gap-2 text-sm py-2 px-2 ${
              i === highlightIndex ? 'bg-orange-500 text-white py-1 rounded-2xl' : 'text-gray-600'
            }`}
          >
            <span>{order.price}</span>
            <span>{order.amount}</span>
            <span>${order.total.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrderBook;
