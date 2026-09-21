import React, { useState } from 'react';
import { Edit2, Trash2, MoreVertical, Bookmark, Copy } from 'lucide-react';

export interface SavedMerchant {
  id: string;
  name: string;
  category: string;
  accountNumber: string;
  nickname: string;
  lastPayment?: {
    amount: number;
    date: string;
  };
  isDefault?: boolean;
}

interface SavedMerchantsProps {
  merchants: SavedMerchant[];
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  onPayMerchant: (merchant: SavedMerchant) => void;
}

const SavedMerchants: React.FC<SavedMerchantsProps> = ({
  merchants,
  onDelete,
  onSetDefault,
  onPayMerchant,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyAccountNumber = (accountNumber: string) => {
    navigator.clipboard.writeText(accountNumber);
    setCopiedId(accountNumber);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="top-0 z-10">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Saved Merchants</h1>
                <p className="text-gray-600 mt-1">Manage your favorite payment merchants</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-6xl mx-auto px-6 py-8">
          {merchants.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <div className="text-5xl mb-4">🏪</div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                No Merchants Saved
              </h2>
              <p className="text-gray-600 mb-6">
                Add merchants from the Available Vendors tab to make payments faster
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {merchants.map((merchant) => (
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
                    {merchant.isDefault && (
                      <span className="bg-blue-600 text-white text-xs font-medium px-2 py-1 rounded-full">
                        Default
                      </span>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-4 space-y-4">
                    {/* Account Details */}
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Account Name</p>
                        <p className="font-medium text-gray-900">{merchant.nickname}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-1">Merchant ID</p>
                        <p className="font-mono text-sm text-gray-700">
                          {merchant.accountNumber}
                        </p>
                      </div>
                    </div>

                    {/* Last Payment */}
                    {merchant.lastPayment && (
                      <div className="pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-600 mb-1">Last Payment</p>
                        <p className="font-semibold text-gray-900">
                          ${merchant.lastPayment.amount.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          {new Date(merchant.lastPayment.date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex gap-2">
                    <button
                      onClick={() => onPayMerchant(merchant)}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Pay Now
                    </button>
                    <div className="relative group">
                      <button className="px-3 py-2 hover:bg-gray-200 rounded-lg transition-colors">
                        <MoreVertical className="w-4 h-4 text-gray-600" />
                      </button>
                      {/* Dropdown Menu */}
                      <div className="absolute right-0 mt-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                        {!merchant.isDefault && (
                          <button
                            onClick={() => onSetDefault(merchant.id)}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Bookmark className="w-4 h-4" />
                            <span>Set as Default</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleCopyAccountNumber(merchant.accountNumber)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
                        >
                          <Copy className="w-4 h-4" />
                          <span>{copiedId === merchant.accountNumber ? 'Copied!' : 'Copy Account No'}</span>
                        </button>
                        <button
                          onClick={() => console.log('Edit merchant:', merchant)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
                        >
                          <Edit2 className="w-4 h-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(merchant.id)}
                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-100"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove from Saved
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Delete Confirmation */}
                  {showDeleteConfirm === merchant.id && (
                    <div className="bg-red-50 border-t border-red-200 px-4 py-3 space-y-3">
                      <p className="text-sm text-red-800 font-medium">
                        Delete this merchant?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            onDelete(merchant.id);
                            setShowDeleteConfirm(null);
                          }}
                          className="flex-1 px-3 py-1 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(null)}
                          className="flex-1 px-3 py-1 bg-gray-200 text-gray-800 text-xs font-medium rounded hover:bg-gray-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default SavedMerchants;
