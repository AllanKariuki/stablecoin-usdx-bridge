import React, { useState } from 'react';
import { Search, Plus, Check } from 'lucide-react';
import BankAccountForm from '../../../components/financial/BankAccountForm';
import type { Bank } from '../../../types/bankAccounts';

interface AvailableBanksProps {
  allBanks: Bank[];
  savedBankIds: string[];
  onAddBank: (bank: Bank) => void;
  onRegisterAccount?: (accountData: any) => void;
  onPayNow?: (bank: Bank) => void;
}

const AvailableBanks: React.FC<AvailableBanksProps> = ({
  allBanks,
  savedBankIds,
  onRegisterAccount,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState<Bank | undefined>(undefined);

  // const [isFormOpen, setIsFormOpen] = useState(false);
  // const [selectedBank, setSelectedBank] = useState<Bank | undefined>(undefined);

  const handleRegisterAccount = (bank: Bank) => {
    setSelectedBank(bank);
    setIsFormOpen(true);
  };

  const handleFormSubmit = (accountData: any) => {
    if (onRegisterAccount) {
      onRegisterAccount(accountData);
    }
    setIsFormOpen(false);
    setSelectedBank(undefined);
  };

  const types = Array.from(new Set(allBanks.map((b) => b.type)));

  const filteredBanks = allBanks.filter(
    (bank) =>
      (bank.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bank.type.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (!selectedType || bank.type === selectedType)
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Available Banks & Institutions</h1>
            <p className="text-gray-600 mt-1">Browse and add banks to your saved list</p>
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
              placeholder="Search banks by name or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Type Filter */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedType(null)}
              className={`px-4 py-2 rounded-full font-medium transition-colors ${
                selectedType === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All Types
            </button>
            {types.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-4 py-2 rounded-full font-medium transition-colors ${
                  selectedType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Banks Grid */}
        {filteredBanks.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="text-5xl mb-4">🏦</div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              No Banks Found
            </h2>
            <p className="text-gray-600">
              Try adjusting your search or filter criteria
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredBanks.map((bank) => {
              const isSaved = savedBankIds.includes(bank.id);
              return (
                <div
                  key={bank.id}
                  className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow overflow-hidden"
                >
                  {/* Card Header */}
                  <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{bank.name}</h3>
                      <p className="text-xs text-gray-600 mt-1">{bank.type}</p>
                    </div>
                    {bank.icon && (
                      <span className="text-3xl">{bank.icon}</span>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-4">
                    {bank.description && (
                      <p className="text-sm text-gray-600 mb-3">{bank.description}</p>
                    )}
                    
                    {/* Support Status */}
                    <div className="mb-3">
                      {bank.isSupported ? (
                        <div className="flex items-center gap-2">
                          <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded-full">
                            ✓ System Supported
                          </span>
                        </div>
                      ) : (
                        <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-1 rounded-full">
                          Not Supported Yet
                        </span>
                      )}
                    </div>

                    {/* Supported Actions */}
                    {bank.isSupported && bank.supportedActions && bank.supportedActions.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-600 mb-2">Available Actions:</p>
                        <div className="flex flex-wrap gap-1">
                          {bank.supportedActions.map((action) => (
                            <span
                              key={action}
                              className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded"
                            >
                              {action.charAt(0).toUpperCase() + action.slice(1)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex gap-2">
                    {!bank.isSupported ? (
                      <button
                        disabled
                        className="w-full px-4 py-2 bg-gray-300 text-gray-500 font-medium rounded-lg cursor-not-allowed"
                      >
                        Coming Soon
                      </button>
                    ) : isSaved ? (
                      <button
                        disabled
                        className="w-full px-4 py-2 bg-green-100 text-green-700 font-medium rounded-lg flex items-center justify-center gap-2 cursor-not-allowed"
                      >
                        <Check className="w-4 h-4" />
                        Saved
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRegisterAccount(bank)}
                        className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Register Account
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bank Account Registration Form */}
      <BankAccountForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setSelectedBank(undefined);
        }}
        onSubmit={handleFormSubmit}
        selectedBank={selectedBank}
      />
    </div>
  );
};

export default AvailableBanks;
