import { useState } from 'react';
import { Search, ChevronRight, MessageSquare, Phone, Mail, Clock, BookOpen } from 'lucide-react';

interface HelpCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  articleCount: number;
  color: string;
}

const Help = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories: HelpCategory[] = [
    {
      id: 'getting-started',
      name: 'Getting Started',
      description: 'Learn the basics and set up your account',
      icon: <BookOpen className="w-6 h-6" />,
      articleCount: 12,
      color: 'bg-blue-100 text-blue-700'
    },
    {
      id: 'account',
      name: 'Account Management',
      description: 'Manage your profile and account settings',
      icon: <Mail className="w-6 h-6" />,
      articleCount: 8,
      color: 'bg-purple-100 text-purple-700'
    },
    {
      id: 'deposits',
      name: 'Deposits & Withdrawals',
      description: 'How to add and withdraw funds',
      icon: <Clock className="w-6 h-6" />,
      articleCount: 15,
      color: 'bg-green-100 text-green-700'
    },
    {
      id: 'payments',
      name: 'Payments & Transfers',
      description: 'Send money and manage payments',
      icon: <MessageSquare className="w-6 h-6" />,
      articleCount: 10,
      color: 'bg-orange-100 text-orange-700'
    },
    {
      id: 'trading',
      name: 'Trading & Investments',
      description: 'Trade crypto and manage investments',
      icon: <Phone className="w-6 h-6" />,
      articleCount: 20,
      color: 'bg-pink-100 text-pink-700'
    },
    {
      id: 'security',
      name: 'Security & Safety',
      description: 'Keep your account secure',
      icon: <Mail className="w-6 h-6" />,
      articleCount: 11,
      color: 'bg-red-100 text-red-700'
    }
  ];

  const articles = [
    {
      id: '1',
      title: 'How do I create an account?',
      category: 'getting-started',
      views: 1250,
      helpful: 950,
      excerpt: 'Step-by-step guide to create your account...'
    },
    {
      id: '2',
      title: 'How to verify my identity (KYC)',
      category: 'account',
      views: 2100,
      helpful: 1890,
      excerpt: 'Complete guide to the KYC verification process...'
    },
    {
      id: '3',
      title: 'How to deposit funds',
      category: 'deposits',
      views: 3400,
      helpful: 3200,
      excerpt: 'Multiple ways to add money to your wallet...'
    },
    {
      id: '4',
      title: 'Withdrawal process and fees',
      category: 'deposits',
      views: 2800,
      helpful: 2500,
      excerpt: 'Learn about withdrawal options and associated fees...'
    },
    {
      id: '5',
      title: 'How to send money to others',
      category: 'payments',
      views: 2200,
      helpful: 2000,
      excerpt: 'Send domestic and international transfers...'
    },
    {
      id: '6',
      title: 'What is 2FA and how to enable it?',
      category: 'security',
      views: 1800,
      helpful: 1700,
      excerpt: 'Set up two-factor authentication for extra security...'
    }
  ];

  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const contactOptions = [
    {
      icon: <MessageSquare className="w-6 h-6" />,
      title: 'Live Chat',
      description: 'Chat with our support team',
      available: 'Available 24/7'
    },
    {
      icon: <Mail className="w-6 h-6" />,
      title: 'Email Support',
      description: 'support@example.com',
      available: 'Respond within 2 hours'
    },
    {
      icon: <Phone className="w-6 h-6" />,
      title: 'Phone Support',
      description: '+1-800-000-0000',
      available: 'Mon-Fri 9AM-6PM EST'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="px-6 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-bold mb-4">How can we help?</h1>
          <p className="text-gray-400 text-lg mb-8">Search our help center or browse categories below</p>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search help articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Categories */}
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Browse by Category</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(selectedCategory === category.id ? null : category.id)}
              className={`p-6 rounded-lg border-2 transition-all text-left ${
                selectedCategory === category.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-3 ${category.color}`}>
                {category.icon}
              </div>
              <h3 className="font-bold text-gray-900">{category.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{category.description}</p>
              <p className="text-xs text-gray-500 mt-3">{category.articleCount} articles</p>
            </button>
          ))}
        </div>

        {/* Articles */}
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {selectedCategory ? 'Articles in Category' : 'Popular Articles'}
        </h2>
        <div className="space-y-3 mb-12">
          {filteredArticles.length > 0 ? (
            filteredArticles.map((article) => (
              <button
                key={article.id}
                className="w-full p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{article.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{article.excerpt}</p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span>👁️ {article.views.toLocaleString()} views</span>
                      <span>👍 {Math.round((article.helpful / article.views) * 100)}% helpful</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </div>
              </button>
            ))
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600">No articles found. Try a different search or category.</p>
            </div>
          )}
        </div>

        {/* Contact Support Section */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-lg p-12 mb-12">
          <h2 className="text-3xl font-bold mb-2">Still need help?</h2>
          <p className="text-gray-300 mb-8">Contact our support team directly</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {contactOptions.map((option, index) => (
              <div key={index} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-lg mb-4">
                  {option.icon}
                </div>
                <h3 className="font-bold text-lg mb-2">{option.title}</h3>
                <p className="text-gray-300 text-sm mb-2">{option.description}</p>
                <p className="text-blue-400 text-xs">{option.available}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="font-bold text-gray-900 mb-4">Quick Links</h3>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-blue-600 hover:text-blue-700 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4" />
                  System Status
                </a>
              </li>
              <li>
                <a href="#" className="text-blue-600 hover:text-blue-700 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4" />
                  API Documentation
                </a>
              </li>
              <li>
                <a href="#" className="text-blue-600 hover:text-blue-700 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4" />
                  Community Forum
                </a>
              </li>
              <li>
                <a href="#" className="text-blue-600 hover:text-blue-700 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4" />
                  Report a Bug
                </a>
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="font-bold text-gray-900 mb-4">FAQs</h3>
            <ul className="space-y-3">
              <li>
                <a href="#" className="text-blue-600 hover:text-blue-700 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4" />
                  What are the transaction fees?
                </a>
              </li>
              <li>
                <a href="#" className="text-blue-600 hover:text-blue-700 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4" />
                  How long do transfers take?
                </a>
              </li>
              <li>
                <a href="#" className="text-blue-600 hover:text-blue-700 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4" />
                  Is my money safe?
                </a>
              </li>
              <li>
                <a href="#" className="text-blue-600 hover:text-blue-700 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4" />
                  How to reset password?
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;
