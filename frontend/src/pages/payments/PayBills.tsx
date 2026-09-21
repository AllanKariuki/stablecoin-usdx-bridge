import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ProviderSelection from '../../components/bills/ProviderSelection';
import AccountSelection from '../../components/bills/AccountSelection';
import AmountEntry from '../../components/bills/AmountEntry';
import PaymentConfirmation from '../../components/bills/PaymentConfirmation';
import PaymentSuccess from '../../components/bills/PaymentSuccess';

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

type PaymentStep = 'provider' | 'account' | 'amount' | 'confirm' | 'success';

const PayBills: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState<PaymentStep>('provider');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<BillProvider | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<SavedAccount | null>(null);
  const [amount, setAmount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const billProviders: BillProvider[] = [
    { id: 'p1', name: 'Kenya Power', icon: '⚡', category: 'electricity' },
    { id: 'p2', name: 'Nairobi Water', icon: '💧', category: 'water' },
    { id: 'p3', name: 'Safaricom Prepaid', icon: '📱', category: 'mobile' },
    { id: 'p4', name: 'Airtel Mobile', icon: '📱', category: 'mobile' },
    { id: 'p5', name: 'Zuku Internet', icon: '📡', category: 'internet' },
    { id: 'p6', name: 'Jamii Gas', icon: '🔥', category: 'gas' },
    { id: 'p7', name: 'Home Insurance', icon: '🏠', category: 'other' },
    { id: 'p8', name: 'Education Fees', icon: '📚', category: 'other' },
  ];

  const savedAccounts: SavedAccount[] = [
    { id: 'a1', provider: 'Kenya Power', accountNumber: '12345678', nickname: 'Home' },
    { id: 'a2', provider: 'Nairobi Water', accountNumber: '87654321', nickname: 'Main' },
  ];

  const categories = useMemo(() => ['electricity', 'water', 'internet', 'mobile', 'gas', 'other'], []);

  // Extract category from URL route and set it automatically
  useEffect(() => {
    const pathSegments = location.pathname.split('/');
    const routeCategory = pathSegments[pathSegments.length - 1];
    
    if (categories.includes(routeCategory)) {
      setSelectedCategory(routeCategory);
    }
  }, [location.pathname, categories]);

  const handleContinue = () => {
    if (step === 'provider' && selectedProvider) {
      setStep('account');
    } else if (step === 'account' && selectedAccount) {
      setStep('amount');
    } else if (step === 'amount' && amount > 0) {
      setStep('confirm');
    }
  };

  const handleBack = () => {
    if (step === 'account') setStep('provider');
    else if (step === 'amount') setStep('account');
    else if (step === 'confirm') setStep('amount');
  };

  const handlePayAnother = () => {
    setStep('provider');
    setSelectedProvider(null);
    setSelectedAccount(null);
    setAmount(0);
  };

  const handleBackToDashboard = () => {
    window.location.href = '/dashboard';
  };

  return (
    <div className="bg-gray-50">
      <div className="flex gap-2 overflow-x-hidden text-sm mt-1 pl-6 mb-5">
        <button
          className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors"
          onClick={() => navigate('/dashboard')}
        >
          Home
        </button>
        <span className="text-gray-400">/</span>
        <button
          className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors"
        >
          Payments
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-semibold">
         Pay Bills
        </span>
      </div>
      {/* Header */}
      <div className="top-0 z-10">
        <div className="max-w-7xl px-6 py-4 flex items-center gap-4">
          {step !== 'provider' && (
            <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          )}
          <h1 className="text-xl font-semibold text-gray-700">Pay Bills</h1>
        </div>
      </div>

      <div className="px-6 py-2">
        {/* Step 1: Select Provider */}
        {step === 'provider' && (
          <ProviderSelection
            billProviders={billProviders}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            categories={categories}
            onContinue={handleContinue}
          />
        )}

        {/* Step 2: Select Account */}
        {step === 'account' && selectedProvider && (
          <AccountSelection
            selectedProvider={selectedProvider}
            savedAccounts={savedAccounts}
            selectedAccount={selectedAccount}
            setSelectedAccount={setSelectedAccount}
            onContinue={handleContinue}
          />
        )}

        {/* Step 3: Enter Amount */}
        {step === 'amount' && selectedProvider && selectedAccount && (
          <AmountEntry
            selectedProvider={selectedProvider}
            selectedAccount={selectedAccount}
            amount={amount}
            setAmount={setAmount}
            onContinue={handleContinue}
          />
        )}

        {/* Step 4: Confirm */}
        {step === 'confirm' && selectedProvider && selectedAccount && (
          <PaymentConfirmation
            selectedProvider={selectedProvider}
            selectedAccount={selectedAccount}
            amount={amount}
            onConfirm={() => setStep('success')}
          />
        )}

        {/* Step 5: Success */}
        {step === 'success' && (
          <PaymentSuccess
            amount={amount}
            onBackToDashboard={handleBackToDashboard}
            onPayAnother={handlePayAnother}
          />
        )}
      </div>
    </div>
  );
};

export default PayBills;
