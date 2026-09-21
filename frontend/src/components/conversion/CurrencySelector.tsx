/**
 * CurrencySelector Component
 * Dropdown selector for currency selection with search
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Currency } from '../../types/conversion';

interface CurrencySelectorProps {
  /** Available currencies to choose from */
  currencies: Currency[];
  /** Currently selected currency code */
  value: string;
  /** Callback when currency is selected */
  onChange: (currencyCode: string) => void;
  /** Currencies to exclude from selection */
  excludeCurrencies?: string[];
  /** Label text */
  label?: string;
  /** Optional CSS class */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * CurrencySelector - Accessible currency dropdown with search
 *
 * @example
 * ```tsx
 * <CurrencySelector
 *   currencies={currencies}
 *   value={selectedCurrency}
 *   onChange={setCurrency}
 *   excludeCurrencies={[toCurrency]}
 *   label="From Currency"
 * />
 * ```
 */
export function CurrencySelector({
  currencies,
  value,
  onChange,
  excludeCurrencies = [],
  label,
  className = '',
  disabled = false,
}: CurrencySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const selected = currencies.find((c) => c.code === value);
  const filteredCurrencies = currencies.filter(
    (c) =>
      !excludeCurrencies.includes(c.code) &&
      (c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleSelect = (currencyCode: string) => {
    onChange(currencyCode);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}

      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className={`w-full px-4 py-3 bg-white border border-gray-300 rounded-lg flex items-center justify-between transition-colors ${
            disabled
              ? 'bg-gray-50 text-gray-500 cursor-not-allowed'
              : 'hover:border-gray-400 cursor-pointer'
          } ${isOpen ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}
        >
          <div className="flex items-center gap-3">
            {selected?.flagEmoji && <span className="text-lg">{selected.flagEmoji}</span>}
            <div className="text-left">
              <div className="font-semibold text-gray-900">{selected?.code || 'Select'}</div>
              <div className="text-xs text-gray-600">{selected?.name}</div>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-gray-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg">
            <div className="p-2 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search currencies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div className="max-h-64 overflow-y-auto">
              {filteredCurrencies.length > 0 ? (
                filteredCurrencies.map((currency) => (
                  <button
                    key={currency.code}
                    onClick={() => handleSelect(currency.code)}
                    className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors ${
                      value === currency.code
                        ? 'bg-blue-50 border-l-4 border-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {currency.flagEmoji && <span className="text-lg">{currency.flagEmoji}</span>}
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">{currency.code}</div>
                      <div className="text-xs text-gray-600">{currency.name}</div>
                    </div>
                    <span className="text-gray-400">{currency.symbol}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-center text-gray-500 text-sm">
                  No currencies found
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
