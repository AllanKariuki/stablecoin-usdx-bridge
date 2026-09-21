import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Bank, UserBankAccount } from '../../types/bankAccounts';

interface BankAccountFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (account: Omit<UserBankAccount, 'id'>) => void;
  selectedBank?: Bank;
  editAccount?: UserBankAccount;
}

const BankAccountForm: React.FC<BankAccountFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  selectedBank,
  editAccount,
}) => {
  const [formData, setFormData] = useState({
    bankName: editAccount?.bankName || selectedBank?.name || '',
    bankId: editAccount?.bankId || selectedBank?.id || '',
    accountNumber: editAccount?.accountNumber || '',
    accountHolder: editAccount?.accountHolder || '',
    type: editAccount?.type || 'Savings Account',
    balance: editAccount?.balance?.toString() || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const accountTypes = [
    'Savings Account',
    'Current Account',
    'Checking Account',
    'Business Account',
    'Fixed Deposit Account',
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.accountNumber.trim()) {
      newErrors.accountNumber = 'Account number is required';
    } else if (!/^\d{10,20}$/.test(formData.accountNumber)) {
      newErrors.accountNumber = 'Account number must be 10-20 digits';
    }

    if (!formData.accountHolder.trim()) {
      newErrors.accountHolder = 'Account holder name is required';
    }

    if (formData.balance && isNaN(Number(formData.balance))) {
      newErrors.balance = 'Balance must be a valid number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    const newAccount: Omit<UserBankAccount, 'id'> = {
      bankId: formData.bankId,
      bankName: formData.bankName,
      accountNumber: formData.accountNumber,
      accountHolder: formData.accountHolder,
      type: formData.type,
      balance: formData.balance ? Number(formData.balance) : undefined,
      isActive: true,
      isVerified: false,
      linkedDate: new Date().toISOString(),
      connectionType: 'manual',
    };

    onSubmit(newAccount);
    handleClose();
  };

  const handleClose = () => {
    setFormData({
      bankName: '',
      bankId: '',
      accountNumber: '',
      accountHolder: '',
      type: 'Savings Account',
      balance: '',
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">
            {editAccount ? 'Edit Bank Account' : 'Register Bank Account'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Bank Name (read-only if selectedBank) */}
          <div>
            <label htmlFor="bankName" className="block text-sm font-medium text-gray-700 mb-1">
              Bank Name
            </label>
            <input
              id="bankName"
              name="bankName"
              type="text"
              value={formData.bankName}
              onChange={handleChange}
              readOnly={!!selectedBank}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                selectedBank ? 'bg-gray-50 cursor-not-allowed' : ''
              }`}
              required
            />
          </div>

          {/* Account Holder */}
          <div>
            <label htmlFor="accountHolder" className="block text-sm font-medium text-gray-700 mb-1">
              Account Holder Name *
            </label>
            <input
              id="accountHolder"
              name="accountHolder"
              type="text"
              value={formData.accountHolder}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter account holder name"
              required
            />
            {errors.accountHolder && (
              <p className="text-red-600 text-xs mt-1">{errors.accountHolder}</p>
            )}
          </div>

          {/* Account Number */}
          <div>
            <label htmlFor="accountNumber" className="block text-sm font-medium text-gray-700 mb-1">
              Account Number *
            </label>
            <input
              id="accountNumber"
              name="accountNumber"
              type="text"
              value={formData.accountNumber}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter account number"
              required
            />
            {errors.accountNumber && (
              <p className="text-red-600 text-xs mt-1">{errors.accountNumber}</p>
            )}
          </div>

          {/* Account Type */}
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
              Account Type *
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
              {accountTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Balance (optional) */}
          <div>
            <label htmlFor="balance" className="block text-sm font-medium text-gray-700 mb-1">
              Initial Balance (Optional)
            </label>
            <input
              id="balance"
              name="balance"
              type="text"
              value={formData.balance}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter balance amount"
            />
            {errors.balance && (
              <p className="text-red-600 text-xs mt-1">{errors.balance}</p>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              {editAccount ? 'Update Account' : 'Register Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BankAccountForm;
