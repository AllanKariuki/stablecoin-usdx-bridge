import React, { useState } from 'react';
import { QrCode, Smartphone, Zap } from 'lucide-react';
import ScanQRCode from './ScanQRCode';
import GenerateQRCode from './GenerateQRCode';
import TapToPay from './TapToPay';

type ActiveTab = 'scan-to-pay' | 'generate-qr' | 'tap-to-pay';

interface POSOption {
  id: ActiveTab;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const POSPayments: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('scan-to-pay');

  const posOptions: POSOption[] = [
    {
      id: 'scan-to-pay',
      label: 'Scan QR Code',
      description: 'Scan merchant QR code to pay',
      icon: <QrCode className="w-8 h-8" />
    },
    {
      id: 'generate-qr',
      label: 'My QR Code',
      description: 'Generate your payment QR code',
      icon: <Smartphone className="w-8 h-8" />
    },
    {
      id: 'tap-to-pay',
      label: 'Tap to Pay (NFC)',
      description: 'Use NFC for contactless payments',
      icon: <Zap className="w-8 h-8" />
    }
  ];

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="flex gap-2 overflow-x-hidden text-sm mt-1 pl-6 mb-5">
        <button className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors">
          Home
        </button>
        <span className="text-gray-400">/</span>
        <button className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors">
          Payments
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-semibold">In-Store Payments</span>
      </div>

      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">In-Store Payments</h1>
        <p className="text-gray-600">Choose a payment method for in-store transactions</p>
      </div>

      {/* POS Options Grid */}
      <div className="max-w-7xl mx-auto px-6 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {posOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => setActiveTab(option.id)}
              className={`p-6 rounded-xl border-2 transition-all transform hover:scale-105 ${
                activeTab === option.id
                  ? 'border-blue-500 bg-blue-50 shadow-lg'
                  : 'border-gray-200 bg-white hover:border-gray-300 shadow'
              }`}
            >
              <div className={`flex justify-center mb-4 ${
                activeTab === option.id ? 'text-blue-600' : 'text-gray-600'
              }`}>
                {option.icon}
              </div>
              <h3 className={`font-semibold text-lg mb-1 ${
                activeTab === option.id ? 'text-blue-900' : 'text-gray-900'
              }`}>
                {option.label}
              </h3>
              <p className="text-sm text-gray-600">{option.description}</p>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {activeTab === 'scan-to-pay' && <ScanQRCode />}
          {activeTab === 'generate-qr' && <GenerateQRCode />}
          {activeTab === 'tap-to-pay' && <TapToPay />}
        </div>

        {/* Recent Payments Section */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Recent Payments</h2>
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="divide-y">
              {/* Recent payments will be populated here */}
              <div className="py-4 text-center text-gray-500">
                <p>No recent payments yet</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default POSPayments;
