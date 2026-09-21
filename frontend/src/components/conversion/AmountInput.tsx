/**
 * AmountInput Component
 * Input field for currency amounts with validation and formatting
 */

import { useState } from 'react';
import type { Currency } from '@src/types/conversion';

interface AmountInputProps {
  /** Current amount value */
  value: number;
  /** Callback when amount changes */
  onChange: (amount: number) => void;
  /** Currency being used for display */
  currency?: Currency;
  /** Minimum allowed amount */
  min?: number;
  /** Maximum allowed amount */
  max?: number;
  /** Label text */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Error message to display */
  error?: string;
  /** Helper text */
  helperText?: string;
  /** Optional CSS class */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Show currency symbol inline */
  showCurrency?: boolean;
}

/**
 * AmountInput - Currency amount input with validation and formatting
 *
 * @example
 * ```tsx
 * <AmountInput
 *   value={amount}
 *   onChange={setAmount}
 *   currency={usdCurrency}
 *   min={1}
 *   max={10000}
 *   label="Amount to Convert"
 * />
 * ```
 */
export function AmountInput({
  value,
  onChange,
  currency,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  label,
  placeholder = '0.00',
  error,
  helperText,
  className = '',
  disabled = false,
  showCurrency = true,
}: AmountInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;

    // Remove non-numeric characters except decimal point
    inputValue = inputValue.replace(/[^\d.]/g, '');

    // Only allow one decimal point
    if (inputValue.includes('.')) {
      const parts = inputValue.split('.');
      inputValue = parts[0] + '.' + parts[1].slice(0, 2);
    }

    const numValue = inputValue === '' ? 0 : parseFloat(inputValue);

    // Validate min/max
    if (numValue >= min && numValue <= max) {
      onChange(numValue);
    }
  };

  const formatDisplay = () => {
    if (value === 0) return '';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}

      <div className="relative">
        {showCurrency && currency && (
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2 pointer-events-none">
            {currency.flagEmoji && <span className="text-lg">{currency.flagEmoji}</span>}
            <span className="text-gray-500 font-medium">{currency.symbol}</span>
          </div>
        )}

        <input
          type="text"
          inputMode="decimal"
          value={isFocused ? (value === 0 ? '' : value) : formatDisplay()}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full py-3 rounded-lg border transition-all ${
            showCurrency && currency ? 'pl-16 pr-4' : 'px-4'
          } ${
            error
              ? 'border-red-500 focus:ring-2 focus:ring-red-200'
              : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
          } ${
            disabled
              ? 'bg-gray-50 text-gray-500 cursor-not-allowed'
              : 'bg-white text-gray-900'
          } font-semibold text-lg`}
        />
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {helperText && !error && <p className="mt-2 text-sm text-gray-600">{helperText}</p>}

      {/* Show min/max info when relevant */}
      {(min > 0 || max < Number.MAX_SAFE_INTEGER) && !isFocused && (
        <p className="mt-1 text-xs text-gray-500">
          {min > 0 && `Min: ${currency?.symbol} ${min}`}
          {min > 0 && max < Number.MAX_SAFE_INTEGER && ' • '}
          {max < Number.MAX_SAFE_INTEGER && `Max: ${currency?.symbol} ${max}`}
        </p>
      )}
    </div>
  );
}
