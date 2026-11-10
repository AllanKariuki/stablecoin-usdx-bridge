import React, { useMemo, useState } from 'react';
import { Search, Plus, Check } from 'lucide-react';
import type { Bank } from '../../../types/bankAccounts';

interface AvailableBanksProps {
  banks: Bank[];
  /** Bank ids the customer already has an account with. */
  registeredBankIds: string[];
  onRegisterAccount: (bank: Bank) => void;
}

/**
 * The institutions a customer can add an account with.
 *
 * Filtering is by **currency**, not by an invented "type" field — the banks
 * table has no such column, and the real question a customer is asking is
 * "which of these can hold my dollars". Which rail an institution settles
 * over is shown because it changes what happens next: an M-Pesa account
 * prompts a PIN on a phone, a bank account does not.
 */
const AvailableBanks: React.FC<AvailableBanksProps> = ({ banks, registeredBankIds, onRegisterAccount }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currency, setCurrency] = useState<string | null>(null);

  const currencies = useMemo(() => Array.from(new Set(banks.map((b) => b.currency))).sort(), [banks]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return banks.filter(
      (bank) =>
        (query === '' || bank.name.toLowerCase().includes(query) || bank.swiftCode.toLowerCase().includes(query)) &&
        (currency === null || bank.currency === currency),
    );
  }, [banks, searchQuery, currency]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-800">Banks &amp; institutions</h1>
        <p className="text-gray-600 mt-1">Add an account to deposit from or withdraw to.</p>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or SWIFT code…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <FilterChip active={currency === null} onClick={() => setCurrency(null)} label="All currencies" />
          {currencies.map((code) => (
            <FilterChip key={code} active={currency === code} onClick={() => setCurrency(code)} label={code} />
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="text-5xl mb-4">🏦</div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">No banks found</h2>
            <p className="text-gray-600">Try a different search or currency.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((bank) => {
              const registered = registeredBankIds.includes(bank.id);
              return (
                <div
                  key={bank.id}
                  className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-lg transition-shadow flex flex-col"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{bank.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {bank.country} · {bank.currency}
                        {bank.swiftCode && ` · ${bank.swiftCode}`}
                      </p>
                    </div>
                    {bank.rail === 'mpesa' && (
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[11px] font-medium rounded-full">
                        Mobile money
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mb-4 flex-1">
                    {bank.rail === 'mpesa'
                      ? 'Deposits are approved with a PIN prompt on your phone.'
                      : 'Deposits and withdrawals settle by bank transfer.'}
                  </p>

                  <button
                    onClick={() => onRegisterAccount(bank)}
                    disabled={registered}
                    className={`w-full px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                      registered
                        ? 'bg-green-50 text-green-700 cursor-default'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {registered ? (
                      <>
                        <Check className="w-4 h-4" />
                        Account added
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Add account
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const FilterChip: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({
  active,
  onClick,
  label,
}) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-full font-medium transition-colors ${
      active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    }`}
  >
    {label}
  </button>
);

export default AvailableBanks;
