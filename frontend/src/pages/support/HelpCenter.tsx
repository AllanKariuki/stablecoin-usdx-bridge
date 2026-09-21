import { useState } from 'react';
import { Search, BookOpen, HelpCircle, MessageCircle, Phone, Mail, ChevronRight, Play } from 'lucide-react';

interface Article {
  id: string;
  title: string;
  description: string;
  category: string;
  views: number;
  helpfulCount?: number;
}

interface Video {
  id: string;
  title: string;
  duration: string;
  category: string;
  thumbnail: string;
  views: number;
}

const HelpCenter = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: 'All Articles', icon: '📚' },
    { id: 'getting-started', label: 'Getting Started', icon: '🚀' },
    { id: 'deposits', label: 'Deposits & Withdrawals', icon: '💰' },
    { id: 'payments', label: 'Payments & Transfers', icon: '💳' },
    { id: 'security', label: 'Security', icon: '🔒' },
    { id: 'account', label: 'Account Management', icon: '⚙️' },
    { id: 'fees', label: 'Fees & Limits', icon: '📊' },
    { id: 'troubleshooting', label: 'Troubleshooting', icon: '🔧' }
  ];

  const articles: Article[] = [
    {
      id: '1',
      title: 'How to create an account?',
      description: 'Step-by-step guide to setting up your account and verifying your identity',
      category: 'getting-started',
      views: 2543,
      helpfulCount: 234
    },
    {
      id: '2',
      title: 'How to deposit funds?',
      description: 'Learn about different deposit methods and how to add money to your wallet',
      category: 'deposits',
      views: 3421,
      helpfulCount: 312
    },
    {
      id: '3',
      title: 'Setting up two-factor authentication',
      description: 'Secure your account with 2FA authentication methods',
      category: 'security',
      views: 1890,
      helpfulCount: 198
    },
    {
      id: '4',
      title: 'Understanding transaction fees',
      description: 'Breakdown of all fees associated with different transaction types',
      category: 'fees',
      views: 2156,
      helpfulCount: 145
    },
    {
      id: '5',
      title: 'Withdrawal process and limits',
      description: 'How to withdraw funds and what daily/monthly limits apply',
      category: 'deposits',
      views: 2987,
      helpfulCount: 267
    },
    {
      id: '6',
      title: 'Sending money to other users',
      description: 'Complete guide to sending and receiving money between accounts',
      category: 'payments',
      views: 3145,
      helpfulCount: 289
    }
  ];

  const videos: Video[] = [
    {
      id: '1',
      title: 'Getting Started with DAMP',
      duration: '4:23',
      category: 'getting-started',
      thumbnail: 'https://via.placeholder.com/300x170',
      views: 5234
    },
    {
      id: '2',
      title: 'How to Make Your First Deposit',
      duration: '3:45',
      category: 'deposits',
      thumbnail: 'https://via.placeholder.com/300x170',
      views: 4123
    },
    {
      id: '3',
      title: 'Keeping Your Account Secure',
      duration: '5:12',
      category: 'security',
      thumbnail: 'https://via.placeholder.com/300x170',
      views: 3456
    }
  ];

  const faqs = [
    {
      id: '1',
      question: 'What is the minimum amount I can deposit?',
      answer: 'The minimum deposit amount is $10 USD or equivalent in other currencies. Some payment methods may have different minimums.',
      category: 'deposits'
    },
    {
      id: '2',
      question: 'How long does verification take?',
      answer: 'Account verification typically takes 1-3 business days. You may be able to use basic features while verification is pending.',
      category: 'account'
    },
    {
      id: '3',
      question: 'Are my funds safe in the wallet?',
      answer: 'Yes, we use industry-standard encryption and security measures to protect your funds. All transactions are monitored for suspicious activity.',
      category: 'security'
    },
    {
      id: '4',
      question: 'Can I change my email address?',
      answer: 'Yes, you can change your email address in Account Settings. You may need to re-verify your new email address.',
      category: 'account'
    },
    {
      id: '5',
      question: 'What payment methods do you accept?',
      answer: 'We accept bank transfers, credit/debit cards, mobile money, and cryptocurrency transfers. Available methods may vary by region.',
      category: 'deposits'
    },
    {
      id: '6',
      question: 'Is there a daily withdrawal limit?',
      answer: 'Daily withdrawal limits vary based on your verification level. Level 1: $1,000, Level 2: $10,000, Level 3: Unlimited.',
      category: 'fees'
    }
  ];

  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         article.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredFAQs = faqs.filter(faq => {
    const matchesSearch = faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Hero Section */}
      <div className="py-12 px-4">
        <div className="max-w-4xl mx-auto text-center mb-8">
          <h1 className="text-4xl font-bold mb-3">Help Center</h1>
          <p className="text-gray-400 text-lg">Find answers and get support</p>
        </div>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto relative">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-blue-300" />
          <input
            type="text"
            placeholder="Search for help..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white"
          />
        </div>
      </div>

      {/* Contact Options */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
              <MessageCircle className="w-6 h-6 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-900 text-sm">Live Chat</p>
                <p className="text-xs text-slate-600">Usually replies in minutes</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
              <Mail className="w-6 h-6 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-900 text-sm">Email Support</p>
                <p className="text-xs text-slate-600">support@damp.com</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
              <Phone className="w-6 h-6 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-900 text-sm">Phone Support</p>
                <p className="text-xs text-slate-600">+1 (800) 123-4567</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
              <HelpCircle className="w-6 h-6 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-slate-900 text-sm">Create Ticket</p>
                <p className="text-xs text-slate-600">Submit a support ticket</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Categories */}
        <div className="mb-8">
          <p className="text-sm font-semibold text-slate-600 mb-4">BROWSE BY CATEGORY</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3">
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`p-3 rounded-lg text-center transition-all font-medium text-sm ${
                  selectedCategory === category.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-900 border border-slate-200 hover:border-blue-400'
                }`}
              >
                <span className="block text-lg mb-1">{category.icon}</span>
                {category.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Section */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Videos Section */}
            {videos.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Play className="w-6 h-6 text-blue-600" />
                  Video Tutorials
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {videos.map(video => (
                    <div
                      key={video.id}
                      className="bg-white rounded-lg overflow-hidden shadow-sm border border-slate-200 hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="relative">
                        <img src={video.thumbnail} alt={video.title} className="w-full h-40 object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 hover:bg-opacity-50 transition-colors">
                          <Play className="w-12 h-12 text-white" />
                        </div>
                        <span className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                          {video.duration}
                        </span>
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-slate-900 text-sm line-clamp-2">{video.title}</h3>
                        <p className="text-xs text-slate-600 mt-2">{video.views.toLocaleString()} views</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Articles Section */}
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <BookOpen className="w-6 h-6 text-blue-600" />
                Articles
              </h2>
              <div className="space-y-3">
                {filteredArticles.length > 0 ? (
                  filteredArticles.map(article => (
                    <div
                      key={article.id}
                      className="bg-white rounded-lg p-4 border border-slate-200 hover:border-blue-400 cursor-pointer transition-all hover:shadow-sm group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {article.title}
                          </h3>
                          <p className="text-sm text-slate-600 mt-1">{article.description}</p>
                          <div className="flex items-center gap-3 mt-3">
                            <span className="text-xs text-slate-500">{article.views.toLocaleString()} views</span>
                            {article.helpfulCount && (
                              <span className="text-xs text-slate-500">
                                {article.helpfulCount} found helpful
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors flex-shrink-0 mt-1" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-600">No articles found matching your search.</p>
                  </div>
                )}
              </div>
            </div>

            {/* FAQs Section */}
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                <HelpCircle className="w-6 h-6 text-blue-600" />
                Frequently Asked Questions
              </h2>
              <div className="space-y-3">
                {filteredFAQs.length > 0 ? (
                  filteredFAQs.map(faq => (
                    <div
                      key={faq.id}
                      className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:border-blue-400 transition-colors"
                    >
                      <button
                        onClick={() => setExpandedFAQ(expandedFAQ === faq.id ? null : faq.id)}
                        className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                      >
                        <span className="font-semibold text-slate-900">{faq.question}</span>
                        <ChevronRight
                          className={`w-5 h-5 text-slate-400 transition-transform ${
                            expandedFAQ === faq.id ? 'rotate-90' : ''
                          }`}
                        />
                      </button>
                      {expandedFAQ === faq.id && (
                        <div className="border-t border-slate-200 p-4 bg-slate-50">
                          <p className="text-slate-700">{faq.answer}</p>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-600">No FAQs found matching your search.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sticky top-4">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Still Need Help?</h3>
              <div className="space-y-3">
                <button className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center justify-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Start Live Chat
                </button>
                <button className="w-full px-4 py-3 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-medium transition-colors flex items-center justify-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email Support
                </button>
                <button className="w-full px-4 py-3 border-2 border-slate-300 text-slate-900 rounded-lg hover:bg-slate-50 font-medium transition-colors flex items-center justify-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Create Ticket
                </button>
              </div>

              {/* Popular Topics */}
              <div className="mt-8 pt-6 border-t border-slate-200">
                <p className="text-sm font-semibold text-slate-700 mb-4">POPULAR TOPICS</p>
                <div className="space-y-2">
                  {[
                    'Account Verification',
                    'Deposit Methods',
                    'Withdrawal Process',
                    'Transaction Fees',
                    'Security Settings'
                  ].map((topic, idx) => (
                    <a
                      key={idx}
                      href="#"
                      className="block text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      → {topic}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpCenter;
