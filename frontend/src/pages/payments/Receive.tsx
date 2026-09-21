import { useNavigate } from 'react-router-dom';
import WalletAddresses from '../../components/payments/WalletAddresses';
import PaymentMethodsList from '../../components/payments/PaymentMethodsList';
import PaymentRequestForm from '../../components/payments/PaymentRequestForm';
import PaymentRequestsHistory from '../../components/payments/PaymentRequestsHistory';

const Receive = () => {
  const navigate = useNavigate();

  const handleGenerateRequest = (data: { amount: string; currency: string; description: string; dueDate: string }) => {
    console.log('Payment request data:', data);
    // Handle payment request generation
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
         Receive Money
        </span>
      </div>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Receive Money</h1>
          <p className="text-gray-600 mt-1">Create payment requests and receive funds</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left - Wallet Addresses and Payment Methods */}
          <div className="lg:col-span-2 space-y-6">
            <WalletAddresses />
            <PaymentMethodsList />
          </div>

          {/* Right - Payment Request Form */}
          <div className="lg:col-span-3">
            <PaymentRequestForm onSubmit={handleGenerateRequest} />
          </div>
        </div>

        {/* Payment Requests History */}
        <div className="mt-6">
          <PaymentRequestsHistory />
        </div>
      </div>
    </div>
  );
};

export default Receive;
