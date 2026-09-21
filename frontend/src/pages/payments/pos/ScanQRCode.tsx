import React, { useState, useRef } from 'react';
import { Camera, X, Check, AlertCircle } from 'lucide-react';

interface ScannedPayment {
  merchantId: string;
  merchantName: string;
  amount: number;
  currency: string;
  reference: string;
  expiresAt: string;
}

const ScanQRCode: React.FC = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedPayment | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleCameraInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Simulate QR code scanning
      // In a real app, you'd use a QR code library like jsQR or qrcode-scanner
      const mockData: ScannedPayment = {
        merchantId: 'MERCH-001',
        merchantName: 'Coffee Shop Deluxe',
        amount: 850,
        currency: 'KES',
        reference: 'QR-20241120-001',
        expiresAt: new Date(Date.now() + 5 * 60000).toISOString()
      };
      setScannedData(mockData);
      setPaymentStatus('idle');
    }
  };

  const handleConfirmPayment = async () => {
    if (!scannedData) return;

    setPaymentStatus('processing');
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    setPaymentStatus('success');

    // Reset after success
    setTimeout(() => {
      setScannedData(null);
      setPaymentStatus('idle');
    }, 2000);
  };

  const handleCancel = () => {
    setScannedData(null);
    setPaymentStatus('idle');
  };

  return (
    <div className="w-full">
      {!scannedData ? (
        <div className="text-center py-12">
          <div className="mb-6 flex justify-center">
            <div className="relative w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center">
              <Camera className="w-12 h-12 text-blue-600" />
              <div className="absolute inset-0 rounded-full border-2 border-blue-600 opacity-30 animate-pulse"></div>
            </div>
          </div>
          
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Scan QR Code</h3>
          <p className="text-gray-600 mb-6">Position the QR code in front of your camera to scan and pay</p>
          
          <div className="flex justify-center gap-3">
            <button
              onClick={() => cameraRef.current?.click()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 mx-auto"
            >
              <Camera className="w-5 h-5" />
              Open Camera
            </button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleCameraInput}
              className="hidden"
            />
          </div>

          <p className="text-sm text-gray-500 mt-4">
            You can also upload an image of a QR code
          </p>
        </div>
      ) : paymentStatus === 'success' ? (
        <div className="text-center py-12">
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Payment Successful</h3>
          <p className="text-gray-600 mb-2">Payment of {scannedData.amount} {scannedData.currency} completed</p>
          <p className="text-sm text-gray-500">Transaction Reference: {scannedData.reference}</p>
          
          <button
            onClick={handleCancel}
            className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Scan Another
          </button>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h3>
          
          <div className="space-y-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Merchant:</span>
              <span className="font-semibold text-gray-900">{scannedData.merchantName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Amount:</span>
              <span className="text-2xl font-bold text-blue-600">
                {scannedData.amount} {scannedData.currency}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Reference:</span>
              <span className="text-sm font-mono text-gray-900">{scannedData.reference}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Valid Until:</span>
              <span className="text-sm text-gray-900">
                {new Date(scannedData.expiresAt).toLocaleTimeString()}
              </span>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800">
              Please verify the merchant and amount before confirming payment
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmPayment}
              disabled={paymentStatus === 'processing'}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              {paymentStatus === 'processing' ? 'Processing...' : 'Confirm Payment'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScanQRCode;
