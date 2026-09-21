import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Contact {
  name: string;
  username: string;
  img: string;
}

type TransferMode = 'fiat' | 'crypto';

const QuickTransfer: React.FC = () => {
  const [transferMode, setTransferMode] = useState<TransferMode>('fiat');
  const [walletAddress, setWalletAddress] = useState('');
  const [selectedWallet, setSelectedWallet] = useState('bitcoin');
  const [selectedFiatWallet, setSelectedFiatWallet] = useState('checking');
  const [amount, setAmount] = useState('742.2');

  const contacts: Contact[] = [
    { name: 'Martha', username: '@marthad', img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marina' },
    { name: 'Cindy', username: '@cindyss', img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Cindy' },
    { name: 'Olivia', username: '@oliv62', img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Olivia' },
    { name: 'David', username: '@davidxc', img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Donte' },
    { name: 'Samuel', username: '@sam224', img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Edmart' },
    { name: 'Jono', username: '@belfazz', img: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jorio' },
  ];

  const cryptoWallets = [
    { id: 'bitcoin', name: 'Bitcoin', symbol: '₿', balance: '0.5234' },
    { id: 'ethereum', name: 'Ethereum', symbol: 'Ξ', balance: '2.1456' },
    { id: 'litecoin', name: 'Litecoin', symbol: 'Ł', balance: '23.511' },
  ];

  const fiatWallets = [
    { id: 'checking', name: 'Checking Account', symbol: '$', balance: '15,234.50' },
    { id: 'savings', name: 'Savings Account', symbol: '$', balance: '42,890.00' },
    { id: 'business', name: 'Business Account', symbol: '$', balance: '8,567.25' },
  ];

  return (
    <div className="bg-white lg:col-span-2 rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Quick Transfer</h2>
          <p className="text-sm text-gray-400">Transfer funds to contacts or crypto wallets</p>
        </div>

        {/* Transfer Mode Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-full p-1">
            <button
              onClick={() => setTransferMode('fiat')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                transferMode === 'fiat'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Fiat
            </button>
            <button
              onClick={() => setTransferMode('crypto')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                transferMode === 'crypto'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Crypto
            </button>
          </div>
        </div>
      </div>

      {/* Crypto Wallet Selector - Only shown in crypto mode */}
      {transferMode === 'crypto' && (
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-2 block">Select Wallet</label>
          <div className="relative">
            <select
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg appearance-none bg-white cursor-pointer hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {cryptoWallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name} ({wallet.symbol}) - Balance: {wallet.balance}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Fiat Wallet Selector - Only shown in fiat mode */}
      {transferMode === 'fiat' && (
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 mb-2 block">Select Account</label>
          <div className="relative">
            <select
              value={selectedFiatWallet}
              onChange={(e) => setSelectedFiatWallet(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg appearance-none bg-white cursor-pointer hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {fiatWallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name} - Balance: {wallet.symbol}{wallet.balance}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Wallet Address Input - Only shown in crypto mode */}
      {transferMode === 'crypto' && (
        <div className="mb-4">
          <label htmlFor="wallet-address" className="text-sm font-medium text-gray-700 mb-2 block">
            Recipient Wallet Address
          </label>
          <input
            id="wallet-address"
            type="text"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="Enter wallet address (e.g., 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb)"
            className="w-full px-4 py-3 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Amount Input */}
      <div className="mb-6">
        <div className="flex items-center justify-between bg-white border-2 border-gray-200 rounded-full p-1">
          <label htmlFor="amount-btc" className="text-sm font-medium text-gray-600 bg-gray-100 rounded-full px-6 py-3 shadow-sm">
            Amount {transferMode === 'crypto' ? cryptoWallets.find(w => w.id === selectedWallet)?.symbol : 'USD'}
          </label>
          <input
            id="amount-btc"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="text-2xl font-bold text-gray-800 bg-transparent text-right outline-none focus:ring-0 border-none px-6 flex-1"
          />
        </div>
      </div>

      {/* Recent Contacts Section - Only shown in fiat mode */}
      {transferMode === 'fiat' && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-md font-semibold text-gray-800">Recent Contacts</h3>
            <button className="text-sm text-gray-600 hover:text-purple-600 font-light">View More</button>
          </div>
          
          {/* Contacts */}
          <div className="flex items-center gap-6">
            {contacts.map((contact) => (
              <div key={contact.name} className="text-center">
                <img 
                  src={contact.img} 
                  alt={contact.name} 
                  className="w-16 h-16 rounded-full mb-2 border-2 border-white hover:border-blue-500 cursor-pointer transition-all" 
                />
                <p className="text-sm font-medium text-gray-800">{contact.name}</p>
                <p className="text-xs text-gray-400">{contact.username}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer Text and Button */}
      <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-4 items-center">
        <p className="text-sm text-gray-400 max-w-xs">
          {transferMode === 'crypto' 
            ? 'Ensure the wallet address is correct. Crypto transfers are irreversible.'
            : 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut'
          }
        </p>
        <button className="col-span-1 px-8 py-3 bg-blue-600 text-white rounded-3xl font-semibold hover:bg-blue-700">
          TRANSFER NOW
        </button>
      </div>
    </div>
  );
};

export default QuickTransfer;
