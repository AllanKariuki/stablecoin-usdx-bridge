import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Bank } from '../../types/bankAccounts';

export interface RegisterAccountInput {
  bankId: string;
  accountName: string;
  accountNumber: string;
  currency: string;
}

interface BankAccountFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (account: RegisterAccountInput) => void;
  banks: Bank[];
  selectedBank?: Bank;
  submitting?: boolean;
}

/**
 * Registering a bank account.
 *
 * Four fields, down from six. The two that went:
 *
 *  - **Account type** ("Savings", "Current"…) was a free-text label nothing
 *    downstream read. services/payments routes by the *bank's* rail, not by
 *    what the customer calls their account.
 *  - **Balance** was a number the customer typed in about their own bank
 *    account, which this platform then displayed as fact. A balance the
 *    platform cannot verify is worse than no balance.
 *
 * The account number is sent once and never stored: services/payments keeps
 * the last four digits and the rail's opaque handle. That is worth telling the
 * customer, so the form says so.
 */
const BankAccountForm: React.FC<BankAccountFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  banks,
  selectedBank,
  submitting = false,
}) => {
  const [bankId, setBankId] = useState(selectedBank?.id ?? '');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const bank = banks.find((b) => b.id === (selectedBank?.id ?? bankId));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!bank) next.bankId = 'Choose a bank';
    if (!accountName.trim()) next.accountName = 'Enter the name on the account';
    // Digits only, and long enough to have a meaningful last four. Deliberately
    // not a per-bank format check: getting that wrong rejects valid accounts,
    // and the rail verifies the account properly anyway.
    if (!/^\d{6,}$/.test(accountNumber.replace(/\s/g, ''))) {
      next.accountNumber = 'Enter the full account number (digits only)';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !bank) return;
    onSubmit({
      bankId: bank.id,
      accountName: accountName.trim(),
      accountNumber: accountNumber.replace(/\s/g, ''),
      currency: bank.currency,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Add a bank account</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
            {selectedBank ? (
              <p className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                {selectedBank.name}
              </p>
            ) : (
              <select
                value={bankId}
                onChange={(e) => setBankId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Choose a bank…</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.currency})
                  </option>
                ))}
              </select>
            )}
            {errors.bankId && <p className="text-red-600 text-xs mt-1">{errors.bankId}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name on the account</label>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="As it appears on your statement"
            />
            {errors.accountName && <p className="text-red-600 text-xs mt-1">{errors.accountName}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account number</label>
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="0000000000"
            />
            {errors.accountNumber && <p className="text-red-600 text-xs mt-1">{errors.accountNumber}</p>}
            <p className="text-xs text-gray-500 mt-1.5">
              We keep only the last four digits. The full number is used once to set up the account with
              your bank and is never stored.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Adding…' : 'Add account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BankAccountForm;
