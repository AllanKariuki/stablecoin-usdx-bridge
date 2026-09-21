/**
 * AssetTypeFilter Component
 * Filter currencies by asset type (fiat, crypto, stablecoin)
 */

import type { AssetType } from '../../types/conversion';

interface AssetTypeFilterProps {
  value: AssetType | 'all';
  onChange: (type: AssetType | 'all') => void;
}

export default function AssetTypeFilter({ value, onChange }: AssetTypeFilterProps) {
  const types: Array<{ value: AssetType | 'all'; label: string; emoji: string }> = [
    { value: 'all', label: 'All', emoji: '🌐' },
    { value: 'fiat', label: 'Fiat', emoji: '💵' },
    { value: 'crypto', label: 'Crypto', emoji: '₿' },
    { value: 'stablecoin', label: 'Stable', emoji: '🔒' },
  ];

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {types.map((type) => (
        <button
          key={type.value}
          onClick={() => onChange(type.value)}
          className={`px-2 py-1 text-xs font-medium rounded transition-all ${
            value === type.value
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span className="mr-1">{type.emoji}</span>
          {type.label}
        </button>
      ))}
    </div>
  );
}
