import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Wallet, 
  ArrowRight,
  TrendingUp,
  Shield,
  Zap,
  Globe
} from 'lucide-react';

const LandingPage: React.FC = () => {
  const features = [
    {
      icon: <Wallet className="w-6 h-6" />,
      title: 'Digital Wallets',
      description: 'Manage multiple currencies in one place'
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: 'Real-time Exchange',
      description: 'Convert currencies at competitive rates'
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: 'Secure Transactions',
      description: 'Bank-grade security for your assets'
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'Instant Transfers',
      description: 'Lightning-fast global payments'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">DAMP</h1>
          </div>
          <Link 
            to="/login" 
            className="text-blue-600 hover:text-blue-700 font-semibold transition-colors"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-medium mb-6">
              <Zap className="w-4 h-4" />
              Digital Asset Management Platform
            </div>
            <h2 className="text-5xl font-bold text-gray-900 mb-6">
              Manage Your Digital Assets with Confidence
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              A comprehensive platform for managing digital wallets, currency conversions, 
              and secure financial transactions across the globe.
            </p>
            <div className="flex gap-4">
              <Link 
                to="/login" 
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg text-lg font-semibold transition-all duration-200 hover:scale-105 inline-flex items-center gap-3 shadow-lg"
              >
                <span>Get Started</span>
                <ArrowRight className="w-5 h-5" />
              </Link>
              <button className="border-2 border-gray-300 hover:border-gray-400 text-gray-700 px-8 py-4 rounded-lg text-lg font-semibold transition-colors">
                Learn More
              </button>
            </div>
          </div>
          
          {/* Illustration */}
          <div className="relative">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-8 shadow-2xl">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-white/80 text-sm">Total Balance</span>
                  <Shield className="w-5 h-5 text-white/80" />
                </div>
                <p className="text-4xl font-bold text-white mb-2">$24,582.00</p>
                <p className="text-green-300 text-sm">+12.5% this month</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                  <Wallet className="w-6 h-6 text-white/80 mb-2" />
                  <p className="text-white/80 text-xs">Wallets</p>
                  <p className="text-white text-xl font-bold">5</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
                  <TrendingUp className="w-6 h-6 text-white/80 mb-2" />
                  <p className="text-white/80 text-xs">Conversions</p>
                  <p className="text-white text-xl font-bold">24</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-gray-900 mb-4">Everything You Need</h3>
            <p className="text-lg text-gray-600">Powerful features to manage your digital assets efficiently</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 mb-4">
                  {feature.icon}
                </div>
                <h4 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h4>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h3 className="text-4xl font-bold text-gray-900 mb-6">
            Ready to Get Started?
          </h3>
          <p className="text-xl text-gray-600 mb-8">
            Join thousands of users managing their digital assets with DAMP
          </p>
          <Link 
            to="/login" 
            className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 rounded-lg text-lg font-semibold transition-all duration-200 hover:scale-105 inline-flex items-center gap-3 shadow-lg"
          >
            <span>Start Now</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-600 text-sm">
          <p>© 2025 DAMP - Digital Asset Management Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;