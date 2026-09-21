import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import RecipientSelection from '../../components/payments/RecipientSelection';
import PaymentDetails from '../../components/payments/PaymentDetails';
import PaymentReview from '../../components/payments/PaymentReview';
import PaymentSuccess from '../../components/payments/PaymentSuccess';
import { useNavigate } from 'react-router-dom';

interface Recipient {
  id: string;
  name: string;
  type: 'individual' | 'business' | 'account' | 'crypto-wallet';
  account: string;
  avatar?: string;
  walletType?: 'fiat' | 'crypto' | 'stablecoin';
  currency?: string;
}

interface SendFormData {
  recipient: string;
  newRecipient: Recipient | null;
  sourceWallet: string;
  amount: number;
  description: string;
  deliveryType: 'instant' | 'scheduled';
  scheduleDate?: string;
  assetType: 'fiat' | 'crypto' | 'stablecoin';
  selectedCurrency: string;
}

const SendMoney: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'recipient' | 'details' | 'review' | 'success'>('recipient');
  const [formData, setFormData] = useState<SendFormData>({
    recipient: '',
    newRecipient: null,
    sourceWallet: '',
    amount: 0,
    description: '',
    deliveryType: 'instant',
    assetType: 'fiat',
    selectedCurrency: 'USD',
  });
  const [transactionRef, setTransactionRef] = useState('');

  const savedRecipients: Recipient[] = [
    { id: 'r1', name: 'John Doe', type: 'individual', account: 'john@email.com', walletType: 'fiat' },
    { id: 'r2', name: 'Jane Smith', type: 'individual', account: 'jane@email.com', walletType: 'fiat' },
    { id: 'r3', name: 'Tech Company Inc', type: 'business', account: 'payments@techco.com', walletType: 'fiat' },
    { id: 'r4', name: 'Alice (BTC)', type: 'crypto-wallet', account: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', walletType: 'crypto', currency: 'BTC' },
    { id: 'r5', name: 'Bob (ETH)', type: 'crypto-wallet', account: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', walletType: 'crypto', currency: 'ETH' },
    { id: 'r6', name: 'Carol (USDT)', type: 'crypto-wallet', account: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', walletType: 'stablecoin', currency: 'USDT' },
  ];

  const handleRecipientSelect = (recipientId: string) => {
    setFormData({ ...formData, recipient: recipientId, newRecipient: null });
  };

  const handleNewRecipientSave = (recipient: Recipient) => {
    setFormData({ ...formData, recipient: '', newRecipient: recipient });
  };

  const handleContinueFromRecipient = () => {
    setStep('details');
  };

  const handleWalletChange = (walletId: string) => {
    setFormData({ ...formData, sourceWallet: walletId });
  };

  const handleAmountChange = (amount: number) => {
    setFormData({ ...formData, amount });
  };

  const handleDescriptionChange = (description: string) => {
    setFormData({ ...formData, description });
  };

  const handleDeliveryTypeChange = (deliveryType: 'instant' | 'scheduled') => {
    setFormData({ ...formData, deliveryType });
  };

  const handleScheduleDateChange = (scheduleDate: string) => {
    setFormData({ ...formData, scheduleDate });
  };

  const handleAssetTypeChange = (assetType: 'fiat' | 'crypto' | 'stablecoin') => {
    setFormData({ ...formData, assetType });
  };

  const handleCurrencyChange = (currency: string) => {
    setFormData({ ...formData, selectedCurrency: currency });
  };

  const handleContinueFromDetails = () => {
    setStep('review');
  };

  const handleConfirmPayment = () => {
    // Generate transaction reference
    const ref = `TXN-${Date.now()}`;
    setTransactionRef(ref);
    setStep('success');
  };

  const handleViewPayment = () => {
    window.location.href = '/payments';
  };

  const handleSendAnother = () => {
    setStep('recipient');
    setFormData({
      recipient: '',
      newRecipient: null,
      sourceWallet: '',
      amount: 0,
      description: '',
      deliveryType: 'instant',
      assetType: 'fiat',
      selectedCurrency: 'USD',
    });
    setTransactionRef('');
  };

  const handleBack = () => {
    if (step === 'details') setStep('recipient');
    else if (step === 'review') setStep('details');
  };

  const recipientInfo = formData.recipient
    ? savedRecipients.find((r) => r.id === formData.recipient)
    : formData.newRecipient;

  return (
    <div className="">
      <div className="flex gap-2 overflow-x-hidden text-sm mt-1 pl-6 mb-3">
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
         Send Money
        </span>
      </div>
      {/* Header */}
      <div className="sticky top-0 z-10">
        <div className="max-w-8xl mx-auto px-6 py-4 flex items-center gap-4">
          {step !== 'recipient' && (
            <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          )}
          <h1 className="text-2xl font-semibold text-gray-700">Send Money</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Step 1: Select Recipient */}
        {step === 'recipient' && (
          <RecipientSelection
            selectedRecipient={formData.recipient}
            newRecipient={formData.newRecipient}
            onRecipientSelect={handleRecipientSelect}
            onNewRecipientSave={handleNewRecipientSave}
            onContinue={handleContinueFromRecipient}
          />
        )}

        {/* Step 2: Payment Details */}
        {step === 'details' && recipientInfo && (
          <PaymentDetails
            recipient={recipientInfo}
            sourceWallet={formData.sourceWallet}
            amount={formData.amount}
            description={formData.description}
            deliveryType={formData.deliveryType}
            scheduleDate={formData.scheduleDate}
            assetType={formData.assetType}
            selectedCurrency={formData.selectedCurrency}
            onWalletChange={handleWalletChange}
            onAmountChange={handleAmountChange}
            onDescriptionChange={handleDescriptionChange}
            onDeliveryTypeChange={handleDeliveryTypeChange}
            onScheduleDateChange={handleScheduleDateChange}
            onAssetTypeChange={handleAssetTypeChange}
            onCurrencyChange={handleCurrencyChange}
            onContinue={handleContinueFromDetails}
          />
        )}

        {/* Step 3: Review */}
        {step === 'review' && recipientInfo && (
          <PaymentReview
            recipient={recipientInfo}
            amount={formData.amount}
            description={formData.description}
            onConfirm={handleConfirmPayment}
          />
        )}

        {/* Step 4: Success */}
        {step === 'success' && recipientInfo && (
          <PaymentSuccess
            recipient={recipientInfo}
            amount={formData.amount}
            transactionRef={transactionRef}
            onViewPayment={handleViewPayment}
            onSendAnother={handleSendAnother}
          />
        )}
      </div>
    </div>
  );
};

export default SendMoney;
