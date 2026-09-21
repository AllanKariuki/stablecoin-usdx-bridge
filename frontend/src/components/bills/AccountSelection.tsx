import React from 'react';
import { Plus } from 'lucide-react';

interface BillProvider {
  id: string;
  name: string;
  icon: string;
  category: string;
}

interface SavedAccount {
  id: string;
  provider: string;
  accountNumber: string;
  nickname: string;
}

interface AccountSelectionProps {
  selectedProvider: BillProvider;
  savedAccounts: SavedAccount[];
  selectedAccount: SavedAccount | null;
  setSelectedAccount: (account: SavedAccount) => void;
  onContinue: () => void;
}

const AccountSelection: React.FC<AccountSelectionProps> = ({
  selectedProvider,
  savedAccounts,
  selectedAccount,
  setSelectedAccount,
  onContinue,
}) => {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Select Account</h2>
        <p className="text-gray-600">Choose the account to pay</p>
      </div>

      <div className="space-y-3">
        {savedAccounts
          .filter((a) => a.provider === selectedProvider.name)
          .map((account) => (
            <button
              key={account.id}
              onClick={() => setSelectedAccount(account)}
              className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                selectedAccount?.id === account.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{account.nickname}</p>
                  <p className="text-sm text-gray-600">Account: ****{account.accountNumber.slice(-4)}</p>
                </div>
                <span className="text-2xl">{selectedProvider.icon}</span>
              </div>
            </button>
          ))}

        {/* Add New Account */}
        <button className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-700 hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center gap-2 justify-center font-medium">
          <Plus className="w-5 h-5" />
          Add New Account
        </button>
      </div>

      <button
        onClick={onContinue}
        disabled={!selectedAccount}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Continue
      </button>
    </div>
  );
};

export default AccountSelection;
