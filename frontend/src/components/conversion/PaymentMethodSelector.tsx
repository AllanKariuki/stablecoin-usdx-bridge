/**
 * PaymentMethodSelector Component
 * Selection interface for payment methods
 */

import { CreditCard, DollarSign, Smartphone } from 'lucide-react';
import type { PaymentMethod } from '../../types/conversion';

interface PaymentMethodSelectorProps {
  /** Available payment methods */
  methods: PaymentMethod[];
  /** Currently selected method ID */
  value: string;
  /** Callback when method is selected */
  onChange: (methodId: string) => void;
  /** Label text */
  label?: string;
  /** Optional CSS class */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * Gets appropriate icon for payment method type
 */
function getMethodIcon(type: PaymentMethod['type']) {
  switch (type) {
    case 'card':
      return <CreditCard className="w-5 h-5" />;
    case 'bank_account':
      return <DollarSign className="w-5 h-5" />;
    case 'mobile_money':
      return <Smartphone className="w-5 h-5" />;
    default:
      return <CreditCard className="w-5 h-5" />;
  }
}

/**
 * Gets display name for payment method type
 */
function getMethodTypeLabel(type: PaymentMethod['type']): string {
  const labels: Record<PaymentMethod['type'], string> = {
    card: 'Credit/Debit Card',
    bank_account: 'Bank Account',
    wallet: 'Digital Wallet',
    mobile_money: 'Mobile Money',
  };
  return labels[type] || 'Payment Method';
}

/**
 * PaymentMethodSelector - Radio-style selection of payment methods
 *
 * @example
 * ```tsx
 * <PaymentMethodSelector
 *   methods={paymentMethods}
 *   value={selectedMethodId}
 *   onChange={setSelectedMethodId}
 *   label="Select Payment Method"
 * />
 * ```
 */
export function PaymentMethodSelector({
  methods,
  value,
  onChange,
  label,
  className = '',
  disabled = false,
}: PaymentMethodSelectorProps) {
  return (
    <div className={className}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-3">{label}</label>}

      <div className="space-y-2">
        {methods.length > 0 ? (
          methods.map((method) => (
            <button
              key={method.id}
              onClick={() => !disabled && onChange(method.id)}
              disabled={disabled}
              className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                value === method.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-start gap-3">
                {/* Radio button */}
                <div className="mt-1">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      value === method.id
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {value === method.id && (
                      <div className="w-2 h-2 bg-white rounded-full" />
                    )}
                  </div>
                </div>

                {/* Icon and details */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <div
                      className={`${
                        value === method.id ? 'text-blue-600' : 'text-gray-600'
                      }`}
                    >
                      {getMethodIcon(method.type)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{method.name}</p>
                      <p className="text-xs text-gray-600">{getMethodTypeLabel(method.type)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 ml-8">
                    •••• {method.lastFour}
                    {method.isDefault && (
                      <span className="ml-2 inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded">
                        Default
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </button>
          ))
        ) : (
          <div className="p-6 text-center bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-gray-600 text-sm mb-2">No payment methods available</p>
            <p className="text-gray-500 text-xs">Add a payment method in settings to continue</p>
          </div>
        )}
      </div>
    </div>
  );
}
