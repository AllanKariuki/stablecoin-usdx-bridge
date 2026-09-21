import { useState } from 'react';
import { CalendarSearch, Download, Upload, MoreHorizontal } from 'lucide-react';
import BalanceCard from '../../components/dashboard/BalanceCard';
import { QuickTransfer } from '../../components/dashboard';
import CardDetails from '../../components/wallet/CardDetails';
import OverviewBalance from '../../components/wallet/OverviewBalance';
import { useNavigate } from 'react-router-dom';

const WalletOverview = () => {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState('Weekly');

  // Wallet Cards Data
  const wallets = [
    { 
      title: 'Main Balance', 
      amount: '$673,412.66', 
      info1: { label: 'Valid Date', value: '08/21' },
      info2: { label: 'CARD HOLDER', value: 'William Fancyson' },
      name: 'William Fancyson',
      color: 'bg-gradient-to-br from-green-400 to-green-600'
    },
    { 
      title: 'Main Balance', 
      amount: '$673,412.66', 
      info1: { label: 'Valid Date', value: '08/21' },
      info2: { label: 'CARD HOLDER', value: 'William Fancyson' },
      name: 'William Fancyson',
      color: 'bg-gradient-to-br from-blue-400 to-blue-600'
    },
    { 
      title: 'Main Balance', 
      amount: '$673,412.66', 
      info1: { label: 'Valid Date', value: '08/21' },
      info2: { label: 'CARD HOLDER', value: 'William Fancyson' },
      name: 'William Fancyson',
      color: 'bg-gradient-to-br from-purple-500 to-purple-700'
    },
    { 
      title: 'Main Balance', 
      amount: '$673,412.66', 
      info1: { label: 'Valid Date', value: '08/21' },
      info2: { label: 'CARD HOLDER', value: 'William Fancyson' },
      name: 'William Fancyson',
      color: 'bg-gradient-to-br from-orange-400 to-orange-600'
    }
  ];

  // Card Details
  const cardDetails = {
    cardNumber: 'Main Balance',
    bankName: 'ABC Center Bank',
    validDate: '08/21',
    cardHolder: 'William Fancyson',
    cardNumberMasked: '**** **** **** 1234',
    monthlyLimit: { main: 66, seconds: 31, others: 7 }
  };

  // Balance Overview Data
  const balanceData = {
    current: '$22,562.14',
    change: '+7%',
    lastWeek: '$321,443',
    chartData: [
      { day: '06', value: 800 },
      { day: '07', value: 600 },
      { day: '08', value: 700 },
      { day: '09', value: 500 },
      { day: '10', value: 600 },
      { day: '11', value: 550 },
      { day: '12', value: 500 },
      { day: '13', value: 650 },
      { day: '14', value: 700 },
      { day: '15', value: 750 },
      { day: '16', value: 680 },
      { day: '17', value: 720 },
      { day: '18', value: 850 },
      { day: '19', value: 780 },
      { day: '20', value: 820 }
    ]
  };

  // Wallet Activity Data
  const activities = [
    { id: 1, type: 'Topup', time: '08:24:45 AM', amount: '+$5,553', status: 'Completed', direction: 'in' },
    { id: 2, type: 'Withdraw', time: '08:24:45 AM', amount: '+$542', status: 'Pending', direction: 'out' },
    { id: 3, type: 'Withdraw', time: '08:24:45 AM', amount: '-$192', status: 'Cancelled', direction: 'out' },
    { id: 4, type: 'Topup', time: '08:24:45 AM', amount: '+$7,762', status: 'Completed', direction: 'in' },
    { id: 5, type: 'Topup', time: '08:24:45 AM', amount: '+$5,553', status: 'Completed', direction: 'in' },
    { id: 6, type: 'Withdraw', time: '08:24:45 AM', amount: '-$192', status: 'Cancelled', direction: 'out' }
  ];

  return (
    <div className="bg-gray-50">
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
          Wallets
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-semibold">
          Wallet overview
        </span>
      </div>
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-800">Wallets</h1>
          <div className="flex items-center gap-3">
            <button className="px-4 py-3 bg-white border border-gray-300 text-gray-700 text-sm rounded-3xl hover:bg-gray-50 flex items-center gap-2">
              <CalendarSearch className='w-4 h-4' />
              Filter Periods
            </button>
            <button className="px-4 py-3 bg-blue-600 text-white text-sm rounded-3xl hover:bg-blue-700 flex items-center gap-2">
              <CalendarSearch className='w-4 h-4' />
              Filter Periods
            </button>
          </div>
        </div>
      </div>

      {/* Upper Half - Wallet Cards (30%) + Card Details & Overview (70%) */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 mb-6">
        {/* Left - Wallet Cards (30%) */}
        <div className="lg:col-span-3 space-y-4">
          {wallets.map((wallet, index) => (
            <BalanceCard key={index} {...wallet} />
          ))}
        </div>

        {/* Right - Card Details & Overview Balance (70%) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card Details */}
          <CardDetails {...cardDetails} />

          {/* Overview Balance */}
          <OverviewBalance 
            current={balanceData.current}
            change={balanceData.change}
            lastWeek={balanceData.lastWeek}
            chartData={balanceData.chartData}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
          />
        </div>
      </div>

      {/* Lower Half - Wallet Activity + Quick Transfer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Wallet Activity (2/3) */}
        <div className="lg:col-span-2">
          {/* Wallet Activity */}
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-800">Wallet Activity</h2>
                <p className="text-sm text-gray-500">Lorem ipsum dolor sit amet, consectetur</p>
              </div>
              <div className="flex gap-1 bg-white rounded-full border border-gray-200 p-1">
                <button className="px-6 py-2 text-sm text-gray-600 rounded-full hover:bg-gray-50 transition-colors">Monthly</button>
                <button className="px-6 py-2 text-sm text-gray-600 rounded-full hover:bg-gray-50 transition-colors">Weekly</button>
                <button className="px-6 py-2 text-sm bg-blue-600 text-white rounded-full font-medium">Today</button>
              </div>
            </div>
            <div className="space-y-1">
              {activities.map((activity) => (
                <div key={activity.id} className="grid grid-cols-5 gap-4 py-4 border-b border-gray-100 last:border-b-0 items-center">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      activity.direction === 'in' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {activity.direction === 'in' ? (
                        <Download className={`w-5 h-5 text-green-600`} />
                      ) : (
                        <Upload className={`w-5 h-5 text-red-600`} />
                      )}
                    </div>
                    <span className="font-medium text-gray-800">{activity.type}</span>
                  </div>
                  <div className="text-sm text-gray-600">{activity.time}</div>
                  <div className={`font-semibold ${activity.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                    {activity.amount}
                  </div>
                  <div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      activity.status === 'Completed' ? 'bg-green-100 text-green-700' :
                      activity.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {activity.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                      <MoreHorizontal className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Transfer (1/3) */}
        <div>
          <QuickTransfer />
        </div>
      </div>
    </div>
  );
};

export default WalletOverview;
