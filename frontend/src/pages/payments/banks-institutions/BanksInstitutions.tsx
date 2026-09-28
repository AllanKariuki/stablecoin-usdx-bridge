import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../../redux/store';
import {
  fetchAvailableBanks,
  fetchBankAccounts,
  registerBankAccount,
  linkBankAccount,
  removeBankAccount,
} from '../../../redux/slices/bankAccountsSlice';
import type { Bank } from '../../../types/bankAccounts';
import AvailableBanks from './AvailableBanks';
import BankAccountsList from '../../../components/financial/BankAccountsList';
import BankAccountForm, { type RegisterAccountInput } from '../../../components/financial/BankAccountForm';

type BankTab = 'all-banks' | 'my-accounts';

/**
 * Banks & institutions, against services/payments.
 *
 * Two tabs, down from four. The Mobile Money tab held a hardcoded M-Pesa
 * account with a made-up balance and a made-up last transaction, and the Bank
 * Transfer tab moved money that never moved — both were local component state
 * with no backend behind them. Mobile money is now an institution like any
 * other (`banks.rail = 'mpesa'`), and transfers happen through the wallet's
 * own money-movement screens, which post to core-ledger.
 */
const BanksInstitutions: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const [activeTab, setActiveTab] = useState<BankTab>('all-banks');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState<Bank | undefined>(undefined);

  const { availableBanks, accounts, loading, submitting, error } = useSelector(
    (state: RootState) => state.bankAccounts,
  );

  useEffect(() => {
    void dispatch(fetchAvailableBanks());
    void dispatch(fetchBankAccounts());
  }, [dispatch]);

  const handleRegister = async (input: RegisterAccountInput) => {
    // unwrap() so a rejected thunk throws here rather than silently leaving
    // the modal open with no explanation. The error itself is already in
    // state and rendered by the list.
    try {
      await dispatch(registerBankAccount(input)).unwrap();
      setFormOpen(false);
      setSelectedBank(undefined);
      setActiveTab('my-accounts');
    } catch {
      // Left open on purpose: the customer's input is still in the form and
      // the banner above the list says what went wrong.
    }
  };

  const handleOpenForm = (bank?: Bank) => {
    setSelectedBank(bank);
    setFormOpen(true);
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="flex gap-2 overflow-x-hidden text-sm mt-1 pl-6 mb-5">
        <button
          className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors"
          onClick={() => navigate('/dashboard')}
        >
          Home
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-semibold">
          {activeTab === 'all-banks' ? 'Banks & institutions' : 'My bank accounts'}
        </span>
      </div>

      <div className="border-b border-gray-200 top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 flex gap-8 overflow-x-auto">
          <Tab
            active={activeTab === 'all-banks'}
            onClick={() => setActiveTab('all-banks')}
            label="All banks"
            count={availableBanks.length}
          />
          <Tab
            active={activeTab === 'my-accounts'}
            onClick={() => setActiveTab('my-accounts')}
            label="My accounts"
            count={accounts.length}
          />
        </div>
      </div>

      {activeTab === 'all-banks' && (
        <AvailableBanks
          banks={availableBanks}
          registeredBankIds={accounts.map((a) => a.bankId)}
          onRegisterAccount={handleOpenForm}
        />
      )}

      {activeTab === 'my-accounts' && (
        <BankAccountsList
          accounts={accounts}
          loading={loading}
          error={error}
          onAddBankAccount={() => handleOpenForm()}
          onVerifyAccount={(id) => void dispatch(linkBankAccount(id))}
          onRemoveAccount={(id) => void dispatch(removeBankAccount(id))}
        />
      )}

      <BankAccountForm
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setSelectedBank(undefined);
        }}
        onSubmit={handleRegister}
        banks={availableBanks}
        selectedBank={selectedBank}
        submitting={submitting}
      />
    </div>
  );
};

const Tab: React.FC<{ active: boolean; onClick: () => void; label: string; count: number }> = ({
  active,
  onClick,
  label,
  count,
}) => (
  <button
    onClick={onClick}
    className={`px-1 py-4 font-medium border-b-2 transition-colors whitespace-nowrap ${
      active ? 'text-blue-600 border-blue-600' : 'text-gray-600 border-transparent hover:text-gray-800'
    }`}
  >
    {label}
    {count > 0 && (
      <span className="ml-2 bg-blue-100 text-blue-600 rounded-full px-2 py-0.5 text-xs font-semibold">{count}</span>
    )}
  </button>
);

export default BanksInstitutions;
