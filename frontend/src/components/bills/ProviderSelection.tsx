import React from 'react';
import { Search } from 'lucide-react';

interface BillProvider {
  id: string;
  name: string;
  icon: string;
  category: string;
}

interface ProviderSelectionProps {
  billProviders: BillProvider[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  selectedProvider: BillProvider | null;
  setSelectedProvider: (provider: BillProvider) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  categories: string[];
  onContinue: () => void;
}

const ProviderSelection: React.FC<ProviderSelectionProps> = ({
  billProviders,
  selectedCategory,
  setSelectedCategory,
  selectedProvider,
  setSelectedProvider,
  searchQuery,
  setSearchQuery,
  categories,
  onContinue,
}) => {
  const filteredProviders = billProviders.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Select Service Provider</h2>
        <p className="text-gray-600">Choose which bill you want to pay</p>
      </div>

      {/* Categories */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            className={`px-4 py-2 rounded-full font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search provider..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Providers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {filteredProviders.map((provider) => (
          <button
            key={provider.id}
            onClick={() => setSelectedProvider(provider)}
            className={`p-6 border-2 rounded-lg text-left transition-all ${
              selectedProvider?.id === provider.id
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-3xl mb-3">{provider.icon}</div>
            <h3 className="font-semibold text-gray-800">{provider.name}</h3>
            <p className="text-xs text-gray-600 mt-1">{provider.category}</p>
          </button>
        ))}
      </div>

      <button
        onClick={onContinue}
        disabled={!selectedProvider}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Continue
      </button>
    </div>
  );
};

export default ProviderSelection;
