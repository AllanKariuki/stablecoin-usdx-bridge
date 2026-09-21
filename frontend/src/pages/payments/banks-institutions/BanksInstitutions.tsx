import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../redux/store';
import {
  fetchAvailableBanks,
  fetchUserBankAccounts,
  fetchLinkedAccounts,
  registerBankAccount,
  linkBankAccount,
  unlinkBankAccount,
  removeBankAccount,
} from '../../../redux/slices/bankAccountsSlice';
import type { SavedBank } from './SavedBanks';
import type { MobileMoneyAccount } from './MobileMoneyAccounts';
import type { Bank, UserBankAccount, LinkedAccount } from '../../../types/bankAccounts';
import AvailableBanks from './AvailableBanks';
import BankTransfer from './BankTransfer';
import MobileMoneyAccounts from './MobileMoneyAccounts';
import BankAccountForm from '../../../components/financial/BankAccountForm';
import LinkAccountForm from '../../../components/financial/LinkAccountForm';
import BankAccountsList from '../../../components/financial/BankAccountsList';

type BankTab = 'all-banks' | 'my-accounts' | 'mobile' | 'transfer';

const BanksInstitutions: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const [activeTab, setActiveTab] = useState<BankTab>('all-banks');
  const [selectedTransferBank, setSelectedTransferBank] = useState<SavedBank | null>(null);

  // Get data from Redux
  const { userBankAccounts, linkedAccounts, availableBanks, loading, error } = useSelector(
    (state: RootState) => state.bankAccounts
  );

  // Form state
  const [isBankAccountFormOpen, setIsBankAccountFormOpen] = useState(false);
  const [isLinkAccountFormOpen, setIsLinkAccountFormOpen] = useState(false);
  const [selectedBankForRegistration, setSelectedBankForRegistration] = useState<Bank | undefined>(undefined);

  // Fetch data on component mount
  useEffect(() => {
    dispatch(fetchAvailableBanks());
    dispatch(fetchUserBankAccounts());
    dispatch(fetchLinkedAccounts());
  }, [dispatch]);

  // Sample saved banks (keeping for backward compatibility)
  const [mobileAccounts, setMobileAccounts] = useState<MobileMoneyAccount[]>([
    {
      id: 'mm1',
      provider: 'M-Pesa',
      phoneNumber: '+254712345678',
      displayName: 'My M-Pesa',
      balance: 15000,
      lastTransaction: { amount: 5000, date: '2025-01-20T15:30:00Z', type: 'received' },
      isDefault: true,
    },
  ]);

  const handleAddBank = (bank: Bank) => {
    setSelectedBankForRegistration(bank);
    setIsBankAccountFormOpen(true);
  };

  const handleRegisterAccount = async (accountData: Omit<UserBankAccount, 'id'>) => {
    try {
      await dispatch(registerBankAccount(accountData)).unwrap();
      setIsBankAccountFormOpen(false);
      setSelectedBankForRegistration(undefined);
      setActiveTab('my-accounts');
    } catch (error) {
      console.error('Failed to register account:', error);
    }
  };

  const handleRemoveAccount = async (id: string) => {
    try {
      await dispatch(removeBankAccount(id)).unwrap();
    } catch (error) {
      console.error('Failed to remove account:', error);
    }
  };

  const handleLinkAccount = async (accountData: Omit<LinkedAccount, 'id'>) => {
    try {
      await dispatch(linkBankAccount(accountData)).unwrap();
      setIsLinkAccountFormOpen(false);
    } catch (error) {
      console.error('Failed to link account:', error);
    }
  };

  const handleUnlinkAccount = async (id: string) => {
    try {
      await dispatch(unlinkBankAccount(id)).unwrap();
    } catch (error) {
      console.error('Failed to unlink account:', error);
    }
  };

  const handleDeleteMobileAccount = (id: string) => {
    setMobileAccounts(mobileAccounts.filter((a) => a.id !== id));
  };

  const handleSetDefaultMobile = (id: string) => {
    setMobileAccounts(
      mobileAccounts.map((a) => ({
        ...a,
        isDefault: a.id === id,
      }))
    );
  };

  const handleBackFromTransfer = () => {
    setActiveTab('my-accounts');
    setSelectedTransferBank(null);
  };

  const getTabLabel = () => {
    switch (activeTab) {
      case 'all-banks':
        return 'All Banks';
      case 'my-accounts':
        return 'My Bank Accounts';
      case 'mobile':
        return 'Mobile Money';
      case 'transfer':
        return 'Bank Transfer';
      default:
        return 'Banks & Institutions';
    }
  };

  const savedBankIds: string[] = [];
  // Future use: handleAddBank and handleRemoveAccount
  void handleAddBank;
  void handleRemoveAccount;

  // Show transfer page if in transfer tab
  if (activeTab === 'transfer' && selectedTransferBank) {
    return (
      <BankTransfer
        bank={selectedTransferBank}
        onBack={handleBackFromTransfer}
        onTransferSuccess={() => setActiveTab('my-accounts')}
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
          Wallets
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-semibold">{getTabLabel()}</span>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 top-0 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-8 overflow-x-auto">
            <button
              onClick={() => setActiveTab('all-banks')}
              className={`px-1 py-4 font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'all-banks'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-800'
              }`}
            >
              All Banks
              <span className="ml-2 bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 text-xs font-semibold">
                {availableBanks.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('my-accounts')}
              className={`px-1 py-4 font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'my-accounts'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-800'
              }`}
            >
              My Bank Accounts
              {userBankAccounts.length > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 text-xs font-semibold">
                  {userBankAccounts.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('mobile')}
              className={`px-1 py-4 font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'mobile'
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-600 border-transparent hover:text-gray-800'
              }`}
            >
              Mobile Money
              {mobileAccounts.length > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 text-xs font-semibold">
                  {mobileAccounts.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'all-banks' && (
        <AvailableBanks
          allBanks={availableBanks}
          savedBankIds={savedBankIds}
          onAddBank={() => window.location.reload()}
          onRegisterAccount={handleRegisterAccount}
        />
      )}

      {activeTab === 'my-accounts' && (
        <BankAccountsList
          userBankAccounts={userBankAccounts}
          linkedAccounts={linkedAccounts}
          loading={loading}
          error={error}
          onAddBankAccount={() => setIsBankAccountFormOpen(true)}
          onLinkAccount={() => setIsLinkAccountFormOpen(true)}
          onUnlinkAccount={handleUnlinkAccount}
        />
      )}

      {activeTab === 'mobile' && (
        <MobileMoneyAccounts
          accounts={mobileAccounts}
          onAddAccount={() => console.log('Add mobile account')}
          onDeleteAccount={handleDeleteMobileAccount}
          onSetDefault={handleSetDefaultMobile}
          onSendMoney={(account) => console.log('Send money from:', account)}
        />
      )}

      {/* Bank Account Registration Form */}
      <BankAccountForm
        isOpen={isBankAccountFormOpen}
        onClose={() => {
          setIsBankAccountFormOpen(false);
          setSelectedBankForRegistration(undefined);
        }}
        onSubmit={handleRegisterAccount}
        selectedBank={selectedBankForRegistration}
      />

      {/* Link Account Form */}
      <LinkAccountForm
        isOpen={isLinkAccountFormOpen}
        onClose={() => setIsLinkAccountFormOpen(false)}
        onSubmit={handleLinkAccount}
      />
    </div>
  );
};

export default BanksInstitutions;
