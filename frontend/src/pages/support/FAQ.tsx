import { useState } from 'react';
import { Search, ChevronDown, ThumbsUp } from 'lucide-react';

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  views: number;
  helpful?: number;
}

const FAQ = () => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [helpfulItems, setHelpfulItems] = useState<Set<string>>(new Set());

  const categories = [
    { id: 'all', label: 'All Topics' },
    { id: 'account', label: 'Account & Registration' },
    { id: 'deposits', label: 'Deposits' },
    { id: 'withdrawals', label: 'Withdrawals' },
    { id: 'payments', label: 'Payments' },
    { id: 'security', label: 'Security' },
    { id: 'verification', label: 'Verification' },
    { id: 'fees', label: 'Fees & Limits' },
    { id: 'trading', label: 'Trading' }
  ];

  const faqs: FAQItem[] = [
    // Account & Registration
    {
      id: '1',
      category: 'account',
      question: 'How do I create an account?',
      answer: 'To create an account, click on "Sign Up" on the homepage. Enter your email address and create a strong password. Then complete your profile information. You\'ll need to verify your email and phone number before you can start using the platform.',
      views: 5432,
      helpful: 324
    },
    {
      id: '2',
      category: 'account',
      question: 'Can I change my email address?',
      answer: 'Yes, you can change your email address in your Account Settings. Go to Settings > Account > Email and enter your new email. You\'ll need to verify the new email address with a confirmation link sent to it.',
      views: 2156,
      helpful: 156
    },
    {
      id: '3',
      category: 'account',
      question: 'How do I reset my password?',
      answer: 'Click on "Forgot Password" on the login page. Enter your email address and we\'ll send you a password reset link. Click the link and set your new password. For security reasons, the link expires after 24 hours.',
      views: 3421,
      helpful: 298
    },
    {
      id: '4',
      category: 'account',
      question: 'Is there an age requirement to use the platform?',
      answer: 'Yes, you must be at least 18 years old to create and use an account. Some features may have different age requirements based on your country\'s regulations.',
      views: 1234,
      helpful: 89
    },

    // Deposits
    {
      id: '5',
      category: 'deposits',
      question: 'What is the minimum deposit amount?',
      answer: 'The minimum deposit amount is $10 USD or equivalent in other currencies. Some payment methods may have higher minimums. You can check the specific minimums for each method during the deposit process.',
      views: 4567,
      helpful: 412
    },
    {
      id: '6',
      category: 'deposits',
      question: 'How long does a deposit take to appear in my account?',
      answer: 'Deposit times vary by payment method: Bank transfers typically take 1-3 business days, Card payments are usually instant, Mobile money is typically instant to 30 minutes. You can track your deposit status in the Deposits section.',
      views: 5234,
      helpful: 467
    },
    {
      id: '7',
      category: 'deposits',
      question: 'What payment methods do you accept?',
      answer: 'We accept bank transfers, credit/debit cards, mobile money, cryptocurrency, and wire transfers. Available methods may vary depending on your country and verification level. Check the deposit page to see which methods are available to you.',
      views: 6123,
      helpful: 534
    },
    {
      id: '8',
      category: 'deposits',
      question: 'Is my deposited money safe?',
      answer: 'Yes, your funds are held in secure, regulated financial institutions. We use industry-standard encryption and security measures. Your funds are protected by our insurance coverage and compliance with financial regulations.',
      views: 3456,
      helpful: 412
    },

    // Withdrawals
    {
      id: '9',
      category: 'withdrawals',
      question: 'What is the daily withdrawal limit?',
      answer: 'Daily withdrawal limits depend on your verification level. Level 1: $1,000/day, Level 2: $10,000/day, Level 3: Unlimited. You can increase your verification level by completing additional identity verification steps.',
      views: 4321,
      helpful: 389
    },
    {
      id: '10',
      category: 'withdrawals',
      question: 'How long does a withdrawal take?',
      answer: 'Withdrawal times depend on the method: Bank transfers: 1-3 business days, Mobile money: 15-60 minutes, Cryptocurrency: 10 minutes to 1 hour depending on network. Withdrawals are processed during business hours.',
      views: 3987,
      helpful: 356
    },
    {
      id: '11',
      category: 'withdrawals',
      question: 'Can I cancel a withdrawal?',
      answer: 'Yes, you can cancel a withdrawal if it\'s still in "pending" status. Once it\'s been processed or sent, it cannot be cancelled. Contact support immediately if you need to cancel an in-progress withdrawal.',
      views: 2134,
      helpful: 178
    },
    {
      id: '12',
      category: 'withdrawals',
      question: 'Why was my withdrawal declined?',
      answer: 'Withdrawals may be declined for several reasons: Insufficient balance, withdrawal limit exceeded, unverified account, suspicious activity detected, or issues with the destination bank/wallet. Check your withdrawal history for details or contact support.',
      views: 2876,
      helpful: 234
    },

    // Payments
    {
      id: '13',
      category: 'payments',
      question: 'How do I send money to another user?',
      answer: 'Go to Payments > Send Money. Enter the recipient\'s email, phone number, or account ID. Enter the amount and optional description. Review the fees and confirm. The recipient will receive the money immediately.',
      views: 5678,
      helpful: 512
    },
    {
      id: '14',
      category: 'payments',
      question: 'Can I schedule recurring payments?',
      answer: 'Yes, you can set up recurring payments. Go to Payments > Scheduled Payments and click "Create New". Select the frequency (daily, weekly, monthly, yearly) and other details. The payment will execute automatically on the scheduled date.',
      views: 3456,
      helpful: 298
    },
    {
      id: '15',
      category: 'payments',
      question: 'Is there a payment limit?',
      answer: 'Yes, payment limits vary by verification level and recipient type. Level 1: $500/transaction, Level 2: $5,000/transaction, Level 3: $50,000/transaction. Business accounts may have higher limits.',
      views: 2987,
      helpful: 267
    },

    // Security
    {
      id: '16',
      category: 'security',
      question: 'How do I enable two-factor authentication?',
      answer: 'Go to Settings > Security > Two-Factor Authentication. Choose your preferred method (authenticator app, SMS, or email). Follow the setup instructions and save your backup codes in a safe place. Enable 2FA on login to secure your account.',
      views: 4123,
      helpful: 367
    },
    {
      id: '17',
      category: 'security',
      question: 'What should I do if I think my account has been hacked?',
      answer: 'If you suspect unauthorized access: 1) Change your password immediately, 2) Enable 2FA if not already active, 3) Check recent transactions and contact support, 4) We can temporarily lock your account for security review. Act quickly and contact support right away.',
      views: 2654,
      helpful: 289
    },
    {
      id: '18',
      category: 'security',
      question: 'Is it safe to provide my card details?',
      answer: 'Yes, your card details are encrypted and never stored on our servers. We use PCI DSS compliant payment processors. Your information is protected by SSL encryption and strict security protocols.',
      views: 3421,
      helpful: 312
    },

    // Verification
    {
      id: '19',
      category: 'verification',
      question: 'Why do I need to verify my account?',
      answer: 'Account verification (KYC) is required for compliance with financial regulations and to protect your account. It helps us prevent fraud and ensure transactions are legitimate. Verification also unlocks higher transaction limits and access to more features.',
      views: 3876,
      helpful: 345
    },
    {
      id: '20',
      category: 'verification',
      question: 'How long does verification take?',
      answer: 'Verification typically takes 1-3 business days. In some cases, it may be instant. You can check your verification status anytime in Settings > Verification Status. We\'ll notify you via email when verification is complete.',
      views: 4567,
      helpful: 423
    },
    {
      id: '21',
      category: 'verification',
      question: 'My verification was rejected, what do I do?',
      answer: 'Check your email for the rejection reason. Common issues include poor image quality, document expiration, or information mismatch. Upload a new document and make sure it\'s clear, current, and matches your account information. Contact support if you need guidance.',
      views: 2987,
      helpful: 267
    },

    // Fees & Limits
    {
      id: '22',
      category: 'fees',
      question: 'What are your transaction fees?',
      answer: 'Fees vary by transaction type: Transfers to other users: 1%, Bank withdrawals: $2-5, Cryptocurrency transfers: Network fee + 0.5%, Bill payments: $0.50-2. See the Fees page for complete details.',
      views: 5432,
      helpful: 489
    },
    {
      id: '23',
      category: 'fees',
      question: 'Are there monthly account fees?',
      answer: 'No, there are no monthly account fees or maintenance charges. You only pay fees when you perform transactions. Inactive accounts don\'t incur any fees.',
      views: 2345,
      helpful: 234
    },

    // Trading
    {
      id: '24',
      category: 'trading',
      question: 'Can I buy and sell cryptocurrencies?',
      answer: 'Yes, if you have a crypto wallet. Go to Trading > Buy/Sell Crypto. Select the cryptocurrency and amount. Review the current market price and fees. Complete the transaction. Crypto transactions appear in your wallet immediately.',
      views: 3876,
      helpful: 312
    },
    {
      id: '25',
      category: 'trading',
      question: 'What is a market order vs limit order?',
      answer: 'A market order buys/sells immediately at the current market price. A limit order lets you set a specific price and waits until the market reaches that price. Limit orders are useful if you want to buy lower or sell higher.',
      views: 2156,
      helpful: 178
    }
  ];

  const filteredFAQs = faqs.filter(faq => {
    const matchesSearch = faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleHelpful = (id: string) => {
    setHelpfulItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Hero Section */}
      <div className="py-12 px-4">
        <div className="max-w-4xl mx-auto text-center mb-8">
          <h1 className="text-4xl font-bold mb-3">Frequently Asked Questions</h1>
          <p className="text-gray-400 text-lg">Find answers to common questions about DAMP</p>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto relative">
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-blue-300" />
          <input
            type="text"
            placeholder="Search FAQs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-white"
          />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Categories */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 py-2 rounded-full font-medium transition-all ${
                  selectedCategory === category.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-900 border border-slate-300 hover:border-blue-400'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>

        {/* FAQs List */}
        <div className="space-y-3">
          {filteredFAQs.length > 0 ? (
            filteredFAQs.map(faq => (
              <div
                key={faq.id}
                className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:border-blue-400 transition-colors"
              >
                <button
                  onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                  className="w-full p-4 flex items-start justify-between hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 text-base">{faq.question}</h3>
                    <p className="text-xs text-slate-500 mt-2">{faq.views.toLocaleString()} views</p>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 flex-shrink-0 mt-1 transition-transform ${
                      expandedId === faq.id ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {expandedId === faq.id && (
                  <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-4">
                    <p className="text-slate-700 leading-relaxed">{faq.answer}</p>

                    <div className="flex items-center gap-4 pt-2">
                      <button
                        onClick={() => handleHelpful(faq.id)}
                        className={`flex items-center gap-2 px-3 py-1 rounded transition-colors ${
                          helpfulItems.has(faq.id)
                            ? 'bg-green-100 text-green-700'
                            : 'text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <ThumbsUp className="w-4 h-4" />
                        <span className="text-sm font-medium">Helpful</span>
                        {faq.helpful && <span className="text-sm">({faq.helpful})</span>}
                      </button>

                      <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                        Still have questions? Contact support
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
              <p className="text-slate-600 text-lg">No FAQs found matching your search.</p>
              <p className="text-slate-500 text-sm mt-2">Try different keywords or browse other categories.</p>
            </div>
          )}
        </div>

        {/* Still Need Help Section */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
          <h3 className="text-xl font-bold text-blue-900 mb-3">Still can't find an answer?</h3>
          <p className="text-blue-800 mb-6">
            If you couldn't find what you're looking for, our support team is here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors">
              Contact Support
            </button>
            <button className="px-6 py-3 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-medium transition-colors">
              Browse Help Center
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FAQ;
