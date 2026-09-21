import React from 'react';
import { ArrowLeft, Plus, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import InvestmentCard from '../../components/financial/investments/InvestmentCard';

/**
 * Investment Portfolio Page
 * Displays investment portfolio and trading options
 */
export default function InvestmentsPage() {
  const [investments] = React.useState([
    {
      id: 'inv-001',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: 50,
      purchasePrice: 15000,
      currentPrice: 19000,
      totalValue: 950000,
      unrealizedGain: 200000,
      unrealizedGainPercent: 26.7,
      riskLevel: 'moderate' as const,
      type: 'stock' as const,
      sector: 'technology',
      purchaseDate: new Date('2023-01-15'),
      dividendYield: 0.5,
      lastDividendDate: new Date('2024-11-01')
    }
  ]);

  const portfolioValue = investments.reduce((sum, inv) => sum + inv.totalValue, 0);
  const totalGain = investments.reduce((sum, inv) => sum + inv.unrealizedGain, 0);
  const gainPercent = (totalGain / (portfolioValue - totalGain) * 100).toFixed(2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/enhanced-dashboard" className="text-slate-600 hover:text-slate-900">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Investment Portfolio</h1>
                <p className="text-slate-600 text-sm mt-1">Track and manage your investments</p>
              </div>
            </div>
            <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-5 h-5" />
              Add Investment
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Portfolio Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Portfolio Value</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">${(portfolioValue / 100000).toFixed(1)}K</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Unrealized Gain</p>
            <p className="text-3xl font-bold text-green-600 mt-2">${(totalGain / 1000).toFixed(1)}K</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Return %</p>
            <div className="flex items-center gap-2 mt-2">
              <TrendingUp className="w-6 h-6 text-green-600" />
              <p className="text-3xl font-bold text-green-600">{gainPercent}%</p>
            </div>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Holdings</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{investments.length}</p>
          </div>
        </div>

        {/* Investments List */}
        <div className="space-y-4">
          {investments.length > 0 ? (
            investments.map((investment) => (
              <InvestmentCard
                key={investment.id}
                investment={investment}
                onView={() => console.log('View investment', investment.id)}
                onSell={() => console.log('Sell investment', investment.id)}
              />
            ))
          ) : (
            <div className="bg-white rounded-lg p-8 text-center border border-slate-200">
              <p className="text-slate-600">No investments found</p>
              <button className="mt-4 text-blue-600 hover:text-blue-700 font-medium">
                Add your first investment
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
