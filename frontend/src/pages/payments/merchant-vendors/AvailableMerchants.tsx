import React, { useState } from 'react';
import { Search, Plus, Check } from 'lucide-react';

interface Merchant {
  id: string;
  name: string;
  category: string;
  icon?: string;
  description?: string;
}

interface AvailableMerchantsProps {
  allMerchants: Merchant[];
  savedMerchantIds: string[];
  onAddMerchant: (merchant: Merchant) => void;
  onPayNow?: (merchant: Merchant) => void;
}

const AvailableMerchants: React.FC<AvailableMerchantsProps> = ({
  allMerchants,
  savedMerchantIds,
  onAddMerchant,
  onPayNow,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = Array.from(new Set(allMerchants.map((m) => m.category)));

  const filteredMerchants = allMerchants.filter(
    (merchant) =>
      (merchant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        merchant.category.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (!selectedCategory || merchant.category === selectedCategory)
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Available Vendors</h1>
            <p className="text-gray-600 mt-1">Browse and add merchants to your saved list</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search vendors by name or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Categories Filter */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-full font-medium transition-colors ${
                selectedCategory === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All Categories
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Merchants Grid */}
        {filteredMerchants.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              No Vendors Found
            </h2>
            <p className="text-gray-600">
              Try adjusting your search or filter criteria
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMerchants.map((merchant) => {
              const isSaved = savedMerchantIds.includes(merchant.id);
              return (
                <div
                  key={merchant.id}
                  className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow overflow-hidden"
                >
                  {/* Card Header */}
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{merchant.name}</h3>
                      <p className="text-xs text-gray-600 mt-1">{merchant.category}</p>
                    </div>
                    {merchant.icon && (
                      <span className="text-3xl">{merchant.icon}</span>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-4">
                    {merchant.description && (
                      <p className="text-sm text-gray-600">{merchant.description}</p>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex gap-2">
                    {isSaved ? (
                      <>
                        <button
                          onClick={() => onPayNow?.(merchant)}
                          className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                        >
                          Pay Now
                        </button>
                        <button
                          disabled
                          className="flex-1 px-4 py-2 bg-green-100 text-green-700 font-medium rounded-lg flex items-center justify-center gap-2 cursor-not-allowed"
                        >
                          <Check className="w-4 h-4" />
                          Saved
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => onPayNow?.(merchant)}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                        >
                          Pay Now
                        </button>
                        <button
                          onClick={() => onAddMerchant(merchant)}
                          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          Add to Saved
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AvailableMerchants;
