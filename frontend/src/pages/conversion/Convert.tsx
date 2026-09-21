/**
 * Convert Page
 * Main conversion interface with quote generation
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, Loader } from 'lucide-react';
import {
  CurrencySelector,
  AmountInput,
  TransactionStepper,
} from '../../components/conversion';
import RateCard from '../../components/conversion/RateCard';
import { useConversion } from '../../hooks/useConversion';
import type { QuoteRequest } from '../../types/conversion';

/**
 * Convert - Main conversion interface with real-time quote generation
 */
export default function Convert() {
  const navigate = useNavigate();
  const { currencies, getQuote, currentQuote, isLoadingQuote, quoteError, reset } =
    useConversion();

  const [fromCurrency, setFromCurrency] = useState('');
  const [toCurrency, setToCurrency] = useState('');
  const [amount, setAmount] = useState(1000);
  const [error, setError] = useState<string>('');

  console.log('Currencies: ', currencies)
  console.log('Current quote: ', currentQuote);
  

  // Fetch quote when currencies or amount change
  useEffect(() => {
    if (amount > 0 && fromCurrency && toCurrency && fromCurrency !== toCurrency) {
      getQuote({
        fromCurrency,
        toCurrency,
        amount,
      } as QuoteRequest);
    }
  }, [fromCurrency, toCurrency, amount, getQuote]);

  // Reset on unmount
  useEffect(() => {
    return () => reset();
  }, [reset]);

  const handleSwapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const handleContinue = () => {
    if (!currentQuote) {
      setError('Please get a valid quote first');
      return;
    }
    navigate(`/convert/quote/${currentQuote.quoteId}`);
  };

  const steps = [
    {
      id: 'quote',
      label: 'Get Quote',
      status: currentQuote ? ('completed' as const) : ('active' as const),
    },
    {
      id: 'payment',
      label: 'Payment',
      status: ('pending' as const),
    },
    {
      id: 'confirm',
      label: 'Confirm',
      status: ('pending' as const),
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Currency Exchange</h1>
          <p className="text-gray-600">Get competitive rates and convert currencies instantly</p>
        </div>

        {/* Stepper */}
        <div className="mb-8 bg-white p-6 rounded-lg border border-gray-200">
          <TransactionStepper steps={steps} currentStep="quote" orientation="horizontal" />
        </div>

        {/* Main card */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 mb-8">
          <div className="space-y-6">
            {/* From currency */}
            <CurrencySelector
              currencies={currencies}
              value={fromCurrency}
              onChange={setFromCurrency}
              excludeCurrencies={[toCurrency]}
              label="From"
            />

            {/* Amount input */}
            <AmountInput
              value={amount}
              onChange={setAmount}
              currency={currencies.find((c) => c.code === fromCurrency)}
              min={1}
              max={1000000}
              label="Amount"
              helperText="Minimum amount is $1"
              showCurrency={true}
            />

            {/* Swap button */}
            <div className="flex justify-center -my-2">
              <button
                onClick={handleSwapCurrencies}
                className="p-3 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full transition-colors"
              >
                <ArrowRightLeft className="w-5 h-5" />
              </button>
            </div>

            {/* To currency */}
            <CurrencySelector
              currencies={currencies}
              value={toCurrency}
              onChange={setToCurrency}
              excludeCurrencies={[fromCurrency]}
              label="To"
            />
          </div>
        </div>

        {/* Rate card */}
        {currentQuote && (
          <div className="mb-8">
            <RateCard
              quote={currentQuote}
              onExpire={() => setError('Quote expired. Please get a new quote.')}
            />
          </div>
        )}

        {/* Loading state */}
        {isLoadingQuote && (
          <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
            <Loader className="w-5 h-5 text-blue-600 animate-spin" />
            <p className="text-blue-700">Getting quote...</p>
          </div>
        )}

        {/* Error messages */}
        {(error || quoteError) && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error || quoteError}</p>
          </div>
        )}

        {/* Continue button */}
        <button
          onClick={handleContinue}
          disabled={!currentQuote || isLoadingQuote}
          className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
            currentQuote && !isLoadingQuote
              ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
              : 'bg-gray-300 text-gray-600 cursor-not-allowed'
          }`}
        >
          Continue to Payment
        </button>
      </div>
    </div>
  );
}
