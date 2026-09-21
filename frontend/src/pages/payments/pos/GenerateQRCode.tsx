import React, { useState } from 'react';
import { Download, Copy, Share2, RefreshCw, CheckCircle } from 'lucide-react';

const GenerateQRCode: React.FC = () => {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isGenerated, setIsGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [walletSelection, setWalletSelection] = useState('primary');

  const wallets = [
    { id: 'primary', name: 'Primary Wallet', balance: 50000, currency: 'KES' },
    { id: 'savings', name: 'Savings Wallet', balance: 150000, currency: 'KES' },
    { id: 'business', name: 'Business Wallet', balance: 500000, currency: 'KES' }
  ];

  const selectedWallet = wallets.find(w => w.id === walletSelection);

  const handleGenerateQR = () => {
    // Simulate QR code generation
    // In a real app, use a library like qrcode.react
    const mockQRCode = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='white'/%3E%3Crect x='20' y='20' width='160' height='160' fill='none' stroke='black' stroke-width='2'/%3E%3C/svg%3E`;
    setQrCode(mockQRCode);
    setIsGenerated(true);
  };

  const handleCopyPaymentLink = () => {
    const paymentLink = `https://damp.app/pay/${selectedWallet?.id}`;
    navigator.clipboard.writeText(paymentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    if (!qrCode) return;
    const link = document.createElement('a');
    link.href = qrCode;
    link.download = `payment-qr-${selectedWallet?.id}.png`;
    link.click();
  };

  const handleShareQR = () => {
    if (navigator.share) {
      navigator.share({
        title: 'My Payment QR Code',
        text: 'Use this QR code to send me a payment',
        url: window.location.href
      });
    }
  };

  const handleRegenerateQR = () => {
    setIsGenerated(false);
    setQrCode(null);
  };

  return (
    <div className="w-full">
      <div className="grid md:grid-cols-2 gap-8">
        {/* Left: Wallet Selection & QR Code */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Your Wallet</h3>
          
          <div className="space-y-3 mb-6">
            {wallets.map((wallet) => (
              <label
                key={wallet.id}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  walletSelection === wallet.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="wallet"
                  value={wallet.id}
                  checked={walletSelection === wallet.id}
                  onChange={(e) => {
                    setWalletSelection(e.target.value);
                    handleRegenerateQR();
                  }}
                  className="hidden"
                />
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900">{wallet.name}</p>
                    <p className="text-sm text-gray-600">
                      Available: {wallet.balance.toLocaleString()} {wallet.currency}
                    </p>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      walletSelection === wallet.id
                        ? 'border-blue-500 bg-blue-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {walletSelection === wallet.id && (
                      <div className="w-2 h-2 bg-white rounded-full" />
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* QR Code Display */}
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            {!isGenerated ? (
              <div className="text-center py-8">
                <div className="mb-4 text-gray-400">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <p className="text-gray-600 text-sm mb-4">No QR code generated yet</p>
                <button
                  onClick={handleGenerateQR}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Generate QR Code
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-48 h-48 mx-auto mb-4 bg-white rounded-lg p-4 flex items-center justify-center">
                  <svg className="w-32 h-32" viewBox="0 0 200 200">
                    <rect width="200" height="200" fill="white" />
                    <rect x="20" y="20" width="160" height="160" fill="none" stroke="black" strokeWidth="2" />
                    {/* Simplified QR pattern */}
                    <circle cx="50" cy="50" r="5" fill="black" />
                    <circle cx="150" cy="50" r="5" fill="black" />
                    <circle cx="50" cy="150" r="5" fill="black" />
                    <rect x="75" y="75" width="50" height="50" fill="none" stroke="black" strokeWidth="1" />
                  </svg>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Payment QR Code for {selectedWallet?.name}
                </p>
                <button
                  onClick={handleRegenerateQR}
                  className="px-4 py-2 text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2 justify-center w-full"
                >
                  <RefreshCw className="w-4 h-4" />
                  Regenerate
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Payment Link & Actions */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Link</h3>
          
          {isGenerated && selectedWallet && (
            <>
              {/* Payment Link */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Your Payment Link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={`https://damp.app/pay/${selectedWallet.id}`}
                    readOnly
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-mono"
                  />
                  <button
                    onClick={handleCopyPaymentLink}
                    className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                      copied
                        ? 'bg-green-100 text-green-700'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="space-y-3 mb-6">
                <h4 className="font-semibold text-gray-900">Share QR Code</h4>
                <button
                  onClick={handleDownloadQR}
                  className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download QR Code
                </button>
                <button
                  onClick={handleShareQR}
                  className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  Share QR Code
                </button>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">How it works</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Others can scan this QR code to send you money</li>
                  <li>• Share the payment link with customers</li>
                  <li>• Payment will be received to your {selectedWallet.name}</li>
                  <li>• QR code never expires</li>
                </ul>
              </div>
            </>
          )}

          {!isGenerated && (
            <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-600">
              <p className="text-sm">Generate a QR code to see your payment link</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GenerateQRCode;
