import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { LinkedAccount } from '../../types/bankAccounts';

interface LinkAccountFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (account: Omit<LinkedAccount, 'id'>) => void;
  editAccount?: LinkedAccount;
}

const LinkAccountForm: React.FC<LinkAccountFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editAccount,
}) => {
  const [formData, setFormData] = useState({
    bankName: editAccount?.bankName || '',
    accountNumber: editAccount?.accountNumber || '',
    accountType: editAccount?.accountType || 'Savings Account',
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

    if (!formData.bankName.trim()) {
      newErrors.bankName = 'Bank name is required';
    }

    if (!formData.accountNumber.trim()) {
      newErrors.accountNumber = 'Account number is required';
    } else if (!/^\d{10,20}$/.test(formData.accountNumber)) {
      newErrors.accountNumber = 'Account number must be 10-20 digits';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    const newLinkedAccount: Omit<LinkedAccount, 'id'> = {
      bankName: formData.bankName,
      accountNumber: formData.accountNumber,
      accountType: formData.accountType,
      linkedDate: new Date().toISOString(),
      lastVerified: new Date().toISOString(),
      isVerified: true, // Assuming instant verification for demo
    };

    onSubmit(newLinkedAccount);
    handleClose();
  };

  const handleClose = () => {
    setFormData({
      bankName: '',
      accountNumber: '',
      accountType: 'Savings Account',
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
            {editAccount ? 'Edit Linked Account' : 'Link Bank Account'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="mx-6 mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Link via Open Banking</h3>
            <p className="text-xs text-blue-700">
              This connects your bank account via secure API integration for real-time balance updates and transactions.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Bank Name */}
          <div>
            <label htmlFor="bankName" className="block text-sm font-medium text-gray-700 mb-1">
              Bank Name *
            </label>
            <input
              id="bankName"
              name="bankName"
              type="text"
              value={formData.bankName}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter bank name"
              required
            />
            {errors.bankName && (
              <p className="text-red-600 text-xs mt-1">{errors.bankName}</p>
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
            <label htmlFor="accountType" className="block text-sm font-medium text-gray-700 mb-1">
              Account Type *
            </label>
            <select
              id="accountType"
              name="accountType"
              value={formData.accountType}
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

          {/* Security Notice */}
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs text-gray-600">
              🔒 Your banking credentials are encrypted and securely stored. We use bank-grade security protocols.
            </p>
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
              {editAccount ? 'Update Link' : 'Link Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LinkAccountForm;
