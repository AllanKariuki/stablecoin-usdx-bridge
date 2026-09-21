import React from 'react';
import { ChevronDown } from 'lucide-react';

const QuickTrade: React.FC = () => {
  return (
    <div className="bg-white lg:col-span-2 rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Quick Trade</h2>
          <p className="text-sm text-gray-400">Lorem ipsum dolor sit amet, consectetur</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-600 rounded-2xl hover:bg-orange-200">
          <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">₿</span>
          </div>
          <span className="text-sm font-medium">224,551 Btc</span>
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      
      <div className="space-y-4">
        {/* Amount BTC */}
        <div className="flex items-center justify-between border border-gray-200 rounded-full px-6 py-4">
          <label htmlFor="amount-btc" className="text-sm text-gray-600 bg-gray-100 rounded-full px-4 py-2 h-full flex items-center">
            Amount BTC
          </label>
          <input 
            id="amount-btc"
            type="text" 
            defaultValue="52.5" 
            className="text-2xl font-bold text-gray-800 bg-transparent text-right outline-none focus:ring-0 border-none w-auto"
          />
        </div>

        {/* Price BPL */}
        <div className="flex items-center justify-between border border-gray-200 rounded-full px-6 py-4">
          <label htmlFor="price-bpl" className="text-sm text-gray-600 bg-gray-100 rounded-full px-4 py-2 h-full flex items-center">
            Price BPL
          </label>
          <input 
            id="price-bpl"
            type="text" 
            placeholder=""
            className="text-2xl font-bold text-gray-800 bg-transparent text-right outline-none focus:ring-0 border-none w-auto"
          />
        </div>

        {/* Fee (1%) */}
        <div className="flex items-center justify-between border border-gray-200 rounded-full px-6 py-4">
          <label htmlFor="fee" className="text-sm text-gray-600 bg-gray-100 rounded-full px-4 py-2 h-full flex items-center">
            Fee (1%)
          </label>
          <input 
            id="fee"
            type="text" 
            placeholder=""
            className="text-2xl font-bold text-gray-800 bg-transparent text-right outline-none focus:ring-0 border-none w-auto"
          />
        </div>

        {/* Total BPL */}
        <div className="flex items-center justify-between border border-gray-200 rounded-full px-6 py-4">
          <label htmlFor="total-bpl" className="text-sm text-gray-600 bg-gray-100 rounded-full px-4 py-2 h-full flex items-center">
            Total BPL
          </label>
          <input 
            id="total-bpl"
            type="text" 
            placeholder=""
            className="text-2xl font-bold text-gray-800 bg-transparent text-right outline-none focus:ring-0 border-none w-auto"
          />
        </div>

        {/* Footer with buttons */}
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-400 max-w-xs">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
          </p>
          <div className="flex gap-3">
            <button className="px-8 py-3 bg-green-500 text-white rounded-full font-semibold hover:bg-green-600 flex items-center gap-2">
              BUY
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 17L17 7M17 7H7M17 7V17" />
              </svg>
            </button>
            <button className="px-8 py-3 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 flex items-center gap-2">
              SELL
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 7L7 17M7 17H17M7 17V7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickTrade;
