import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SavedMerchant } from './SavedMerchants';
import SavedMerchants from './SavedMerchants';
import AvailableMerchants from './AvailableMerchants';
import MerchantHistory from './MerchantHistory';
import MerchantPay from './MerchantPay';

type MerchantTab = 'saved' | 'available' | 'history' | 'pay';

interface Merchant {
  id: string;
  name: string;
  category: string;
  icon?: string;
  description?: string;
  accountNumber?: string;
  nickname?: string;
}

// All available merchants in the system
const ALL_MERCHANTS: Merchant[] = [
  {
    id: 'm1',
    name: 'Carrefour Supermarket',
    category: 'Retail',
    icon: '🛒',
    description: 'Groceries and general merchandise',
    accountNumber: 'CARR001',
    nickname: 'Carrefour Westlands',
  },
  {
    id: 'm2',
    name: 'Tech Hub Kenya',
    category: 'Electronics',
    icon: '💻',
    description: 'Electronics and gadgets',
    accountNumber: 'TECH001',
    nickname: 'Main Store',
  },
  {
    id: 'm3',
    name: 'Pizza Hut',
    category: 'Food & Beverage',
    icon: '🍕',
    description: 'Pizzas and fast food',
    accountNumber: 'PIZZA001',
    nickname: 'Pizza Delivery',
  },
  {
    id: 'm4',
    name: 'Safeway Pharmacy',
    category: 'Healthcare',
    icon: '💊',
    description: 'Pharmacy and health products',
    accountNumber: 'SAFE001',
    nickname: 'Local Pharmacy',
  },
  {
    id: 'm5',
    name: 'Nakumatt Supermarket',
    category: 'Retail',
    icon: '🛍️',
    description: 'Supermarket chains',
    accountNumber: 'NAKU001',
    nickname: 'Nakumatt',
  },
  {
    id: 'm6',
    name: 'KFC Kenya',
    category: 'Food & Beverage',
    icon: '🍗',
    description: 'Fried chicken and meals',
    accountNumber: 'KFC001',
    nickname: 'KFC Delivery',
  },
  {
    id: 'm7',
    name: 'Jumia Kenya',
    category: 'Electronics',
    icon: '📦',
    description: 'Online shopping platform',
    accountNumber: 'JUMIA001',
    nickname: 'Jumia Account',
  },
  {
    id: 'm8',
    name: 'Quick Mart',
    category: 'Retail',
    icon: '🏬',
    description: 'Quick shopping convenience stores',
    accountNumber: 'QUICK001',
    nickname: 'Quick Mart',
  },
];

const Merchants: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<MerchantTab>('saved');
  const [selectedPayMerchant, setSelectedPayMerchant] = useState<SavedMerchant | null>(null);
  const [savedMerchants, setSavedMerchants] = useState<SavedMerchant[]>([
    {
      id: 'm1',
      name: 'Carrefour Supermarket',
      category: 'Retail',
      accountNumber: 'CARR001',
      nickname: 'Carrefour Westlands',
      lastPayment: { amount: 5000, date: '2025-01-15T14:30:00Z' },
      isDefault: true,
    },
  ]);

  const handleAddMerchant = (merchant: Merchant) => {
    // Convert available merchant to saved merchant
    const newSavedMerchant: SavedMerchant = {
      id: merchant.id,
      name: merchant.name,
      category: merchant.category,
      accountNumber: merchant.accountNumber || '',
      nickname: merchant.nickname || merchant.name,
    };

    if (!savedMerchants.find((m) => m.id === merchant.id)) {
      setSavedMerchants([...savedMerchants, newSavedMerchant]);
      // Optionally switch to saved tab after adding
      setActiveTab('saved');
    }
  };

  const handleDeleteMerchant = (id: string) => {
    setSavedMerchants(savedMerchants.filter((m) => m.id !== id));
  };

  const handleSetDefault = (id: string) => {
    setSavedMerchants(
      savedMerchants.map((m) => ({
        ...m,
        isDefault: m.id === id,
      }))
    );
  };

  const handlePayMerchant = (merchant: SavedMerchant) => {
    setSelectedPayMerchant(merchant);
    setActiveTab('pay');
  };

  const handleBackFromPay = () => {
    setActiveTab('saved');
    setSelectedPayMerchant(null);
  };

  const getTabLabel = () => {
    switch (activeTab) {
      case 'saved':
        return 'Saved Merchants';
      case 'available':
        return 'Available Vendors';
      case 'history':
        return 'Payment History';
      case 'pay':
        return 'Pay Merchant';
      default:
        return 'Merchants';
    }
  };

  const savedMerchantIds = savedMerchants.map((m) => m.id);

  // Show payment page if in pay tab
  if (activeTab === 'pay' && selectedPayMerchant) {
    return (
      <MerchantPay
        merchant={selectedPayMerchant}
        onBack={handleBackFromPay}
        onPaymentSuccess={() => setActiveTab('history')}
      />
    );
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="flex gap-2 overflow-x-hidden text-sm mt-1 pl-6 mb-5">
        <button
          className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors"
          onClick={() => navigate('/dashboard')}
        >
          Home
        </button>
        <span className="text-gray-400">/</span>
        <button className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors">
          Payments
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-semibold">{getTabLabel()}</span>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('saved')}
              className={`px-1 py-4 font-medium border-b-2 transition-colors ${
                activeTab === 'saved'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-800'
              }`}
            >
              Saved Merchants
              {savedMerchants.length > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 text-xs font-semibold">
                  {savedMerchants.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('available')}
              className={`px-1 py-4 font-medium border-b-2 transition-colors ${
                activeTab === 'available'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-800'
              }`}
            >
              Available Vendors
              <span className="ml-2 bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 text-xs font-semibold">
                {ALL_MERCHANTS.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-1 py-4 font-medium border-b-2 transition-colors ${
                activeTab === 'history'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-800'
              }`}
            >
              Payment History
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'saved' && (
        <SavedMerchants
          merchants={savedMerchants}
          onDelete={handleDeleteMerchant}
          onSetDefault={handleSetDefault}
          onPayMerchant={handlePayMerchant}
        />
      )}

      {activeTab === 'available' && (
        <AvailableMerchants
          allMerchants={ALL_MERCHANTS}
          savedMerchantIds={savedMerchantIds}
          onAddMerchant={handleAddMerchant}
        />
      )}

      {activeTab === 'history' && (
        <MerchantHistory
          onNavigateToPay={() => setActiveTab('saved')}
          onNavigateToSaved={() => setActiveTab('saved')}
        />
      )}
    </div>
  );
};

export default Merchants;
