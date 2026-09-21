// import React, { useState } from 'react';
// import { HelpCircle, Shield, Download, Upload, RefreshCw, FileText, ChevronDown, ChevronUp, ExternalLink, CalendarSearch } from 'lucide-react';

// // Component Imports
// import KPICard from '../components/dashboard/KPICard';
// import AssetRow from '../components/dashboard/AssetRow';
// import TransactionRow from '../components/dashboard/TransactionRow';
// import QuickActionButton from '../components/dashboard/QuickActionButton';
// import PendingItem from '../components/dashboard/PendingItem';
// import PortfolioChart from '../components/dashboard/PortfolioChart';
// import BalanceCard from '../components/dashboard/BalanceCard';

// const Dashboard = () => {
//   const [showAllAssets, setShowAllAssets] = useState(false);
//   const [timeRange, setTimeRange] = useState('30D');

//   // KPI Data
//   const kpiData = {
//     totalBalance: { 
//       value: '$120,403.20', 
//       delta: '+$2,847.53', 
//       deltaPercent: '+2.42%', 
//       isPositive: true, 
//       sparkline: [45, 52, 48, 65, 72, 68, 75] 
//     },
//     available: { 
//       value: '$98,231.45', 
//       delta: '+$1,204.11', 
//       deltaPercent: '+1.24%', 
//       isPositive: true, 
//       sparkline: [50, 48, 55, 60, 58, 62, 65] 
//     },
//     locked: { 
//       value: '$22,171.75', 
//       delta: '+$643.42', 
//       deltaPercent: '+2.99%', 
//       isPositive: true, 
//       sparkline: [20, 22, 21, 24, 26, 25, 28] 
//     },
//     pnl24h: { 
//       value: '+$1,847.22', 
//       deltaPercent: '+1.56%', 
//       isPositive: true, 
//       sparkline: [40, 45, 42, 48, 52, 55, 58] 
//     },
//     lastActivity: { 
//       value: '2 min ago' 
//     }
//   };

//   // Assets Data
//   const assets = [
//     { symbol: 'BTC', name: 'Bitcoin', amount: '2.45 BTC', usdValue: '$82,450.00', change24h: '+2.4%', isPositive: true },
//     { symbol: 'ETH', name: 'Ethereum', amount: '15.8 ETH', usdValue: '$28,440.00', change24h: '+1.8%', isPositive: true },
//     { symbol: 'USDT', name: 'Tether', amount: '9,513.25 USDT', usdValue: '$9,513.25', change24h: '0.0%', isPositive: true },
//     { symbol: 'SOL', name: 'Solana', amount: '245.5 SOL', usdValue: '$12,275.00', change24h: '-0.5%', isPositive: false },
//     { symbol: 'BNB', name: 'Binance Coin', amount: '42.3 BNB', usdValue: '$10,152.90', change24h: '+3.2%', isPositive: true },
//     { symbol: 'XRP', name: 'Ripple', amount: '8,420 XRP', usdValue: '$4,210.00', change24h: '+5.1%', isPositive: true }
//   ];

//   // Transactions Data
//   const recentTransactions = [
//     { id: '1', type: 'deposit' as const, asset: 'BTC', amount: '0.5 BTC', status: 'completed' as const, time: '2 min ago', txHash: '0xabc123...' },
//     { id: '2', type: 'trade' as const, asset: 'ETH/USDT', amount: '2.5 ETH', status: 'completed' as const, time: '15 min ago' },
//     { id: '3', type: 'withdraw' as const, asset: 'USDT', amount: '5,000 USDT', status: 'pending' as const, time: '1 hour ago', txHash: '0xdef456...' },
//     { id: '4', type: 'convert' as const, asset: 'BTC → ETH', amount: '0.2 BTC', status: 'completed' as const, time: '3 hours ago' },
//     { id: '5', type: 'deposit' as const, asset: 'ETH', amount: '5.0 ETH', status: 'completed' as const, time: '5 hours ago', txHash: '0xghi789...' },
//     { id: '6', type: 'trade' as const, asset: 'SOL/USDT', amount: '100 SOL', status: 'completed' as const, time: '1 day ago' }
//   ];

//   // Wallet Cards Data
//   const wallets = [
//     { 
//       title: 'Main Wallet', 
//       amount: '$67,876.32', 
//       info1: { label: 'WALLET ID', value: 'WLT001' },
//       info2: { label: 'TYPE', value: 'Primary' },
//       name: 'Active',
//       color: 'bg-gradient-to-br from-blue-400 to-blue-600'
//     },
//     { 
//       title: 'Savings Wallet', 
//       amount: '$22,466.24', 
//       info1: { label: 'WALLET ID', value: 'WLT002' },
//       info2: { label: 'TYPE', value: 'Savings' },
//       name: 'Active',
//       color: 'bg-gradient-to-br from-green-400 to-green-600'
//     },
//     { 
//       title: 'Trading Wallet', 
//       amount: '$6,786.25', 
//       info1: { label: 'WALLET ID', value: 'WLT003' },
//       info2: { label: 'TYPE', value: 'Trading' },
//       name: 'Active',
//       color: 'bg-gradient-to-br from-orange-400 to-orange-600'
//     },
//     { 
//       title: 'Reserve Wallet', 
//       amount: '$240.66', 
//       info1: { label: 'WALLET ID', value: 'WLT004' },
//       info2: { label: 'TYPE', value: 'Reserve' },
//       name: 'Active',
//       color: 'bg-gradient-to-br from-purple-500 to-purple-700'
//     }
//   ];

//   // Action Handlers
//   const handleDeposit = () => console.log('Open Deposit Modal');
//   const handleWithdraw = () => console.log('Open Withdraw Modal');
//   const handleConvert = () => console.log('Open Convert Modal');
//   const handleInvoice = () => console.log('Open Generate Invoice Modal');

//   return (
//     <div className="min-h-screen bg-gray-50">
//       {/* Page Header with Search & Filters */}
//       <div className="mb-6">
//         <div className="flex items-center justify-between">
//           <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
//           <div className="flex items-center gap-3">
//             <button className="px-4 py-3 bg-blue-600 text-white text-sm rounded-3xl hover:bg-blue-700 flex items-center gap-2">
//               <CalendarSearch className='w-4 h-4 ' />
//               Filter Periods
//             </button>
//           </div>
//         </div>
//       </div>


//       {/* Top KPI Summary Bar */}
//       <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
//         <KPICard 
//           label="Total Balance" 
//           value={kpiData.totalBalance.value} 
//           delta={kpiData.totalBalance.delta}
//           deltaPercent={kpiData.totalBalance.deltaPercent}
//           isPositive={kpiData.totalBalance.isPositive}
//           sparklineData={kpiData.totalBalance.sparkline}
//         />
//         <KPICard 
//           label="Available Balance" 
//           value={kpiData.available.value} 
//           delta={kpiData.available.delta}
//           deltaPercent={kpiData.available.deltaPercent}
//           isPositive={kpiData.available.isPositive}
//           sparklineData={kpiData.available.sparkline}
//         />
//         <KPICard 
//           label="Locked/Reserved" 
//           value={kpiData.locked.value} 
//           delta={kpiData.locked.delta}
//           deltaPercent={kpiData.locked.deltaPercent}
//           isPositive={kpiData.locked.isPositive}
//           sparklineData={kpiData.locked.sparkline}
//         />
//         <KPICard 
//           label="24h P/L" 
//           value={kpiData.pnl24h.value} 
//           deltaPercent={kpiData.pnl24h.deltaPercent}
//           isPositive={kpiData.pnl24h.isPositive}
//           sparklineData={kpiData.pnl24h.sparkline}
//         />
//       </div>

//       {/* Portfolio Chart + Quick Actions Row */}
//       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
//         {/* Portfolio Chart (60%) */}
//         <div className="lg:col-span-2">
//           <PortfolioChart timeRange={timeRange} setTimeRange={setTimeRange} />
//         </div>

//         {/* Quick Actions (40%) */}
//         <div className="lg:col-span-1">
//           <div className="bg-white rounded-xl p-6 border border-gray-200 h-1/2">
//             <h2 className="text-lg font-bold text-gray-800 mb-4">Quick Actions</h2>
//             <div className="grid grid-cols-4 gap-4">
//               <QuickActionButton 
//                 icon={Download} 
//                 label="Deposit" 
//                 color="bg-green-400" 
//                 onClick={handleDeposit}
//               />
//               <QuickActionButton 
//                 icon={Upload} 
//                 label="Withdraw" 
//                 color="bg-red-400" 
//                 onClick={handleWithdraw}
//               />
//               <QuickActionButton 
//                 icon={RefreshCw} 
//                 label="Convert" 
//                 color="bg-blue-400" 
//                 onClick={handleConvert}
//               />
//               <QuickActionButton 
//                 icon={FileText} 
//                 label="Invoice" 
//                 color="bg-purple-400" 
//                 onClick={handleInvoice}
//               />
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Wallet Cards Row - Full Width */}
//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
//         {wallets.map((wallet, index) => (
//           <BalanceCard key={index} {...wallet} />
//         ))}
//       </div>

//       {/* Bottom Section - Assets & Transactions + Alerts & Market */}
//       <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
//         {/* Left Column (60%) - Assets & Transactions */}
//         <div className="lg:col-span-3 space-y-6">
//           {/* Balances Breakdown */}
//           <div className="bg-white rounded-xl p-6 border border-gray-200">
//             <div className="flex items-center justify-between mb-4">
//               <div>
//                 <h2 className="text-lg font-bold text-gray-800">Asset Balances</h2>
//                 <p className="text-sm text-gray-500">Your cryptocurrency holdings</p>
//               </div>
//               <button
//                 onClick={() => setShowAllAssets(!showAllAssets)}
//                 className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
//                 aria-label={showAllAssets ? 'Show less' : 'Show all'}
//               >
//                 {showAllAssets ? (
//                   <>Show Less <ChevronUp className="w-4 h-4" /></>
//                 ) : (
//                   <>Show All <ChevronDown className="w-4 h-4" /></>
//                 )}
//               </button>
//             </div>
//             <div className="space-y-1">
//               {(showAllAssets ? assets : assets.slice(0, 4)).map((asset) => (
//                 <AssetRow key={asset.symbol} {...asset} />
//               ))}
//             </div>
//           </div>

//           {/* Recent Activity Feed */}
//           <div className="bg-white rounded-xl p-6 border border-gray-200">
//             <div className="flex items-center justify-between mb-4">
//               <div>
//                 <h2 className="text-lg font-bold text-gray-800">Recent Transactions</h2>
//                 <p className="text-sm text-gray-500">Your latest account activity</p>
//               </div>
//               <button className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1">
//                 View All <ExternalLink className="w-3 h-3" />
//               </button>
//             </div>
//             <div className="space-y-1">
//               {recentTransactions.map((tx) => (
//                 <TransactionRow key={tx.id} {...tx} />
//               ))}
//             </div>
//           </div>
//         </div>

//         {/* Right Column (40%) - Alerts & Market Updates */}
//         <div className="lg:col-span-2 space-y-6">
//           {/* Pending Items & Alerts */}
//           <div className="bg-white rounded-xl p-6 border border-gray-200">
//             <h2 className="text-lg font-bold text-gray-800 mb-4">Alerts & Pending</h2>
//             <div className="space-y-3">
//               <PendingItem 
//                 type="warning"
//                 title="KYC Verification Required"
//                 description="Complete your identity verification to unlock full account features."
//                 action={{ label: 'Complete KYC', onClick: () => console.log('Navigate to KYC') }}
//               />
//               <PendingItem 
//                 type="info"
//                 title="Withdrawal Processing"
//                 description="Your USDT withdrawal of 5,000 is being processed. Est. 10-30 min."
//                 action={{ label: 'View Details', onClick: () => console.log('View withdrawal') }}
//               />
//             </div>
//           </div>

//           {/* Market News Widget */}
//           <div className="bg-white rounded-xl p-6 border border-gray-200">
//             <h2 className="text-lg font-bold text-gray-800 mb-4">Market Updates</h2>
//             <div className="space-y-3">
//               <div className="p-3 bg-gray-50 rounded-lg">
//                 <div className="flex items-start justify-between mb-1">
//                   <span className="font-semibold text-sm text-gray-900">BTC/USD</span>
//                   <span className="text-green-600 font-semibold text-sm">+2.4%</span>
//                 </div>
//                 <div className="text-xs text-gray-600">$33,680.25</div>
//               </div>
//               <div className="p-3 bg-gray-50 rounded-lg">
//                 <div className="flex items-start justify-between mb-1">
//                   <span className="font-semibold text-sm text-gray-900">ETH/USD</span>
//                   <span className="text-green-600 font-semibold text-sm">+1.8%</span>
//                 </div>
//                 <div className="text-xs text-gray-600">$1,800.50</div>
//               </div>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Footer */}
//       <footer className="mt-12 py-6 border-t border-gray-200 bg-white">
//         <div className="flex items-center justify-between flex-wrap gap-4 text-sm text-gray-600">
//           <div className="flex items-center gap-6">
//             <a href="#" className="hover:text-blue-600 flex items-center gap-1">
//               <HelpCircle className="w-4 h-4" />
//               Help & Support
//             </a>
//             <a href="#" className="hover:text-blue-600 flex items-center gap-1">
//               <Shield className="w-4 h-4" />
//               Security
//             </a>
//             <a href="#" className="hover:text-blue-600">Terms of Service</a>
//             <a href="#" className="hover:text-blue-600">Privacy Policy</a>
//           </div>
//           <div className="text-xs text-gray-500">
//             © 2025 DAMP. All rights reserved.
//           </div>
//         </div>
//       </footer>
//     </div>
//   );
// }

// export default Dashboard;


import { useState } from 'react';
import { 
  CalendarSearch, 
  Wallet, 
  TrendingUp, 
  TrendingDown,
  Clock,
  CheckCircle,
  AlertCircle,
  Users,
  AlertTriangle,
  Info,
} from 'lucide-react';
import DonutChart from '../components/charts/DonutChart';
import MarketOverview from '../components/charts/MarketOverview';
import QuickTransfer from '../components/dashboard/QuickTransfer';
import QuickActions from '../components/dashboard/QuickActions';
import RecentTransactions from '../components/dashboard/RecentTransactions';
import { mockTransactions } from '../types/transactions/transactions';

const Dashboard = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('This Month');

  const walletBalances = [
    { type: 'Fiat', balance: 67876.32, currency: 'USD', change: 2.3, accounts: 3, color: 'from-blue-400 to-blue-600' },
    { type: 'Stablecoins', balance: 22466.24, currency: 'USDT/USDC', change: 0.1, accounts: 2, color: 'from-green-400 to-green-600' },
    { type: 'Crypto', balance: 15234.89, currency: 'BTC/ETH', change: -4.2, accounts: 5, color: 'from-purple-500 to-purple-700' },
    { type: 'Savings', balance: 45000.00, currency: 'USD', change: 1.8, accounts: 1, color: 'from-orange-400 to-orange-600' },
  ];

  const scheduledPayments = [
    { id: '1', name: 'Rent Payment', recipient: 'Property Manager', amount: 25000, currency: 'KES', date: '2024-12-10', status: 'upcoming' },
    { id: '2', name: 'Netflix Subscription', recipient: 'Netflix', amount: 15.99, currency: 'USD', date: '2024-12-08', status: 'upcoming' },
    { id: '3', name: 'Internet Bill', recipient: 'Safaricom Fiber', amount: 8500, currency: 'KES', date: '2024-12-12', status: 'upcoming' },
  ];

  const topVendors = [
    { name: 'Safaricom', icon: '📱', amount: 15420, transactions: 23, color: 'bg-green-100 text-green-600' },
    { name: 'Kenya Power', icon: '⚡', amount: 9800, transactions: 12, color: 'bg-yellow-100 text-yellow-600' },
    { name: 'Naivas Supermarket', icon: '🛒', amount: 7650, transactions: 8, color: 'bg-blue-100 text-blue-600' },
    { name: 'Uber', icon: '🚗', amount: 4230, transactions: 15, color: 'bg-purple-100 text-purple-600' },
  ];

  const alerts = [
    { 
      id: '1', 
      type: 'warning', 
      title: 'KYC Verification Required', 
      description: 'Complete your identity verification to unlock full account features.',
      action: 'Complete KYC'
    },
    { 
      id: '2', 
      type: 'info', 
      title: 'Withdrawal Processing', 
      description: 'Your withdrawal of $5,000 is being processed. Est. 10-30 min.',
      action: 'View Details'
    },
    { 
      id: '3', 
      type: 'warning', 
      title: 'Pending Bill Payment', 
      description: 'You have 2 bills due this week. Review and pay to avoid late fees.',
      action: 'View Bills'
    },
  ];

  const spendingCategories = [
    { name: 'Bills & Utilities', amount: '$25,420', color: 'bg-orange-500', value: 25420, percentage: 35 },
    { name: 'Shopping', amount: '$18,500', color: 'bg-blue-500', value: 18500, percentage: 25 },
    { name: 'Transport', amount: '$12,300', color: 'bg-purple-500', value: 12300, percentage: 17 },
    { name: 'Food & Dining', amount: '$9,800', color: 'bg-green-500', value: 9800, percentage: 13 },
    { name: 'Other', amount: '$7,280', color: 'bg-pink-500', value: 7280, percentage: 10 },
  ];

  const totalBalance = walletBalances.reduce((sum, wallet) => sum + wallet.balance, 0);

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
            <p className="text-gray-500 mt-1">Welcome back! Here's your financial overview</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="px-4 py-3 bg-blue-600 text-white text-sm rounded-3xl hover:bg-blue-700 cursor-pointer appearance-none pr-10"
              >
                <option>Today</option>
                <option>This Week</option>
                <option>This Month</option>
                <option>This Year</option>
              </select>
              <CalendarSearch className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Total Balance Overview */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-8 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-200 mb-2">Total Portfolio Value</p>
            <h2 className="text-5xl font-bold mb-4">${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
            <div className="flex items-center gap-2 text-green-300">
              <TrendingUp className="w-5 h-5" />
              <span className="text-lg font-semibold">+5.2% this month</span>
            </div>
          </div>
          <div className="text-right">
            <Wallet className="w-20 h-20 text-indigo-300 mb-4" />
            <p className="text-indigo-200">Across {walletBalances.reduce((sum, w) => sum + w.accounts, 0)} accounts</p>
          </div>
        </div>
      </div>

      {/* Wallet Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {walletBalances.map((wallet) => (
          <div key={wallet.type} className={`bg-gradient-to-br ${wallet.color} rounded-xl p-6 text-white`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold opacity-90">{wallet.type}</h3>
              <Wallet className="w-6 h-6 opacity-80" />
            </div>
            <p className="text-3xl font-bold mb-2">${wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            <div className="flex items-center justify-between">
              <p className="text-sm opacity-80">{wallet.currency}</p>
              <div className={`flex items-center gap-1 text-sm ${wallet.change >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                {wallet.change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>{Math.abs(wallet.change)}%</span>
              </div>
            </div>
            <p className="text-xs opacity-70 mt-2">{wallet.accounts} {wallet.accounts === 1 ? 'account' : 'accounts'}</p>
          </div>
        ))}
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-sm">This Month Income</p>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-gray-800">$12,450</p>
          <p className="text-xs text-green-600 mt-1">+18% from last month</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-sm">This Month Expenses</p>
            <TrendingDown className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-gray-800">$8,230</p>
          <p className="text-xs text-red-600 mt-1">+5% from last month</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-sm">Active Payments</p>
            <Clock className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-800">3</p>
          <p className="text-xs text-gray-600 mt-1">Scheduled this month</p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-500 text-sm">Transactions</p>
            <CheckCircle className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-2xl font-bold text-gray-800">156</p>
          <p className="text-xs text-gray-600 mt-1">This month</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Spending Breakdown - Donut Chart */}
        <DonutChart data={spendingCategories} title="Spending Breakdown" />

        {/* Market Overview - Line Chart */}
        <MarketOverview title="Market Overview" subtitle="Cryptocurrency market trends" />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Recent Transactions - Takes 2 columns */}
        <div className="lg:col-span-2">
          <RecentTransactions transactions={mockTransactions} limit={6} />
        </div>

        {/* Spending Categories Breakdown */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Category Details</h2>
              <p className="text-sm text-gray-500">This month's expenses</p>
            </div>
          </div>

          <div className="space-y-4">
            {spendingCategories.map((category) => (
              <div key={category.name}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700">{category.name}</span>
                  <span className="text-sm font-semibold text-gray-800">{category.amount}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className={`${category.color} h-2 rounded-full transition-all duration-500`}
                    style={{ width: `${category.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Total Spent</span>
              <span className="text-lg font-bold text-gray-800">
                ${spendingCategories.reduce((sum, cat) => sum + cat.value, 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Scheduled Payments */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Upcoming Payments</h2>
              <p className="text-sm text-gray-500">Scheduled transactions</p>
            </div>
            <Clock className="w-5 h-5 text-gray-400" />
          </div>

          <div className="space-y-3">
            {scheduledPayments.map((payment) => (
              <div key={payment.id} className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-800">{payment.name}</p>
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                </div>
                <p className="text-xs text-gray-600 mb-2">{payment.recipient}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{new Date(payment.date).toLocaleDateString()}</span>
                  <span className="text-sm font-bold text-gray-800">{payment.currency} {payment.amount.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          <button className="w-full mt-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
            View All Scheduled Payments
          </button>
        </div>

        {/* Top Vendors */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Top Vendors</h2>
              <p className="text-sm text-gray-500">Most frequent payments</p>
            </div>
            <Users className="w-5 h-5 text-gray-400" />
          </div>

          <div className="space-y-3">
            {topVendors.map((vendor) => (
              <div key={vendor.name} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${vendor.color}`}>
                    {vendor.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{vendor.name}</p>
                    <p className="text-xs text-gray-500">{vendor.transactions} transactions</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-gray-800">${vendor.amount.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts & Pending */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Alerts & Pending</h2>
              <p className="text-sm text-gray-500">Important notifications</p>
            </div>
            <AlertCircle className="w-5 h-5 text-gray-400" />
          </div>

          <div className="space-y-3">
            {alerts.map((alert) => (
              <div 
                key={alert.id} 
                className={`p-4 rounded-lg border-l-4 ${
                  alert.type === 'warning' 
                    ? 'bg-orange-50 border-orange-500' 
                    : 'bg-blue-50 border-blue-500'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {alert.type === 'warning' ? (
                      <AlertTriangle className="w-5 h-5 text-orange-600" />
                    ) : (
                      <Info className="w-5 h-5 text-blue-600" />
                    )}
                    <p className="text-sm font-semibold text-gray-800">{alert.title}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mb-3">{alert.description}</p>
                <button 
                  className={`text-xs font-medium ${
                    alert.type === 'warning' 
                      ? 'text-orange-600 hover:text-orange-700' 
                      : 'text-blue-600 hover:text-blue-700'
                  }`}
                >
                  {alert.action} →
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Market Updates */}
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Market Updates</h2>
              <p className="text-sm text-gray-500">Crypto price changes</p>
            </div>
            <TrendingUp className="w-5 h-5 text-gray-400" />
          </div>

          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">₿</span>
                  <span className="font-semibold text-sm text-gray-900">BTC/USD</span>
                </div>
                <span className="text-green-600 font-semibold text-sm flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  +2.4%
                </span>
              </div>
              <div className="text-lg font-bold text-gray-800">$43,680.25</div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">Ξ</span>
                  <span className="font-semibold text-sm text-gray-900">ETH/USD</span>
                </div>
                <span className="text-green-600 font-semibold text-sm flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  +1.8%
                </span>
              </div>
              <div className="text-lg font-bold text-gray-800">$2,280.50</div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">Ł</span>
                  <span className="font-semibold text-sm text-gray-900">LTC/USD</span>
                </div>
                <span className="text-red-600 font-semibold text-sm flex items-center gap-1">
                  <TrendingDown className="w-4 h-4" />
                  -0.5%
                </span>
              </div>
              <div className="text-lg font-bold text-gray-800">$95.32</div>
            </div>
          </div>
        </div>

        {/* Quick Transfer */}
        <QuickTransfer />

        {/* Quick Actions */}
        <QuickActions />
      </div>
    </div>
  );
}

export default Dashboard;
