  // ============ MOCK IMPLEMENTATIONS ============

import type { Currency, ConversionRequest, ConversionResponse, KYCData, QuoteRequest, QuoteResponse, TransactionStatusUpdate, TransactionHistory, Wallet, StablecoinBalance, ReserveStatus, OrderBookDepth, LiquiditySource } from "../../types/conversion";

export const mockGetCurrencies = (): Currency[] => {
  return [
    // Fiat
    {
      code: 'USD',
      name: 'US Dollar',
      symbol: '$',
      flagEmoji: '🇺🇸',
      type: 'fiat',
    },
    {
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
      flagEmoji: '🇪🇺',
      type: 'fiat',
    },
    {
      code: 'GBP',
      name: 'British Pound',
      symbol: '£',
      flagEmoji: '🇬🇧',
      type: 'fiat',
    },
    {
      code: 'JPY',
      name: 'Japanese Yen',
      symbol: '¥',
      flagEmoji: '🇯🇵',
      type: 'fiat',
    },
    {
      code: 'AUD',
      name: 'Australian Dollar',
      symbol: 'A$',
      flagEmoji: '🇦🇺',
      type: 'fiat',
    },
    {
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: 'C$',
      flagEmoji: '🇨🇦',
      type: 'fiat',
    },
    {
      code: 'CHF',
      name: 'Swiss Franc',
      symbol: 'CHF',
      flagEmoji: '🇨🇭',
      type: 'fiat',
    },
    
    // Crypto
    { 
      code: 'BTC', 
      name: 'Bitcoin', 
      symbol: '₿', 
      type: 'crypto',
      decimals: 8,
      isNative: true 
    },
    { 
      code: 'ETH', 
      name: 'Ethereum', 
      symbol: 'Ξ', 
      type: 'crypto',
      decimals: 18,
      network: 'ethereum',
      isNative: true 
    },
    { 
      code: 'SOL', 
      name: 'Solana', 
      symbol: '◎', 
      type: 'crypto',
      decimals: 9,
      network: 'solana',
      isNative: true 
    },
    
    // Stablecoins
    { 
      code: 'USD-X', 
      name: 'USD-X Stablecoin', 
      symbol: 'USD-X', 
      type: 'stablecoin',
      decimals: 6,
      network: 'ethereum',
      contractAddress: '0x...' 
    },
    { 
      code: 'USDC', 
      name: 'USD Coin', 
      symbol: 'USDC', 
      type: 'stablecoin',
      decimals: 6,
      network: 'ethereum',
      contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' 
    },
  ];
}

export const mockGetQuote = (request: QuoteRequest): QuoteResponse => {
  // Simulate realistic exchange rates
  const rates: Record<string, number> = {
    USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, AUD: 1.52, CAD: 1.36, CHF: 0.88,
    BTC: 67000, ETH: 3500, SOL: 145,
    'USD-X': 1, USDC: 1
  };

  const currencies = mockGetCurrencies();
  const fromCurrency = currencies.find(c => c.code === request.fromCurrency);
  const toCurrency = currencies.find(c => c.code === request.toCurrency);

  const fromRate = rates[request.fromCurrency] || 1;
  const toRate = rates[request.toCurrency] || 1;
  const exchangeRate = toRate / fromRate;

  const toAmount = Number((request.amount * exchangeRate).toFixed(8));
  
  // Determine conversion type
  const fromType = fromCurrency?.type || 'fiat';
  const toType = toCurrency?.type || 'fiat';
  const conversionType = `${fromType}_to_${toType}` as any;

  // Calculate fees based on conversion type
  let processingFee = 0;
  let conversionFee = 0;
  let networkFee = 0;

  if (fromType === 'fiat' && toType === 'fiat') {
    processingFee = request.amount * 0.015;
    conversionFee = request.amount * 0.005;
  } else if (fromType === 'fiat' && toType === 'stablecoin') {
    // Fiat to stablecoin (mint): minimal fees
    processingFee = request.amount * 0.001;
    networkFee = 5; // gas fee
  } else if (fromType === 'stablecoin' && toType === 'fiat') {
    // Stablecoin to fiat (burn): minimal fees
    processingFee = request.amount * 0.001;
  } else if (fromType === 'crypto' || toType === 'crypto') {
    // Crypto conversions: higher fees
    processingFee = request.amount * 0.01;
    conversionFee = request.amount * 0.005;
    networkFee = toType === 'crypto' ? 15 : 0;
  }

  const totalFees = processingFee + conversionFee + networkFee;

  return {
    success: true,
    data: {
      quoteId: `QT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fromCurrency: request.fromCurrency,
      toCurrency: request.toCurrency,
      fromAmount: request.amount,
      toAmount,
      exchangeRate: Number(exchangeRate.toFixed(8)),
      fees: {
        processingFee: 1.0,
        conversionFee: 0.5,
        networkFee,
        total: totalFees,
      },
      totalFees,
      netAmount: toAmount - totalFees,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      conversionType,
      executionVenue: toType === 'crypto' ? 'Coinbase' : 'Internal',
      slippageTolerance: request.slippageTolerance || 0.5,
      priceImpact: 0.1,
      gasEstimate: networkFee > 0 ? {
        network: 'ethereum',
        gasLimit: 21000,
        gasPrice: '30',
        estimatedCost: networkFee,
        estimatedCostCrypto: 0.0001,
      } : undefined,
      settlementTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      taxImplication: (fromType === 'crypto' && toType !== 'stablecoin') ? {
        fmvAtConversion: toAmount,
        acquisitionCostBasis: request.amount * 0.8,
        capitalGain: toAmount - (request.amount * 0.8),
        holdingPeriod: 120,
        taxCategory: 'long_term',
      } : undefined,
    },
  };
}

export const mockConfirmConversion = (request: ConversionRequest): ConversionResponse => {
  return {
    success: true,
    data: {
      transactionId: `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      quoteId: request.quoteId,
      fromCurrency: 'USD',
      toCurrency: 'BTC',
      fromAmount: 1000,
      toAmount: 0.015,
      fees: {
        processingFee: 1.0,
        conversionFee: 0.5,
        networkFee: 15,
        total: 16.5,
      },
      paymentMethod: {
        id: 'pm-001',
        type: 'wallet',
        name: 'USD Wallet',
        balance: 5000,
        currency: 'USD',
        lastFour: '****',
        isDefault: true,
      },
      status: 'processing',
      createdAt: new Date().toISOString(),
      ledgerTxId: `LDG-${Date.now()}`,
      txHash: '0x' + Math.random().toString(16).substr(2, 64),
    },
    nextSteps: [
      'Transaction submitted to blockchain',
      'Waiting for confirmations (est. 10 minutes)',
      'Funds will be available after 3 confirmations',
    ],
    estimatedCompletion: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

export const mockGetTransactionStatus = (
  transactionId: string
): TransactionStatusUpdate => {
  const statuses: TransactionStatusUpdate['status'][] = [
    'pending',
    'processing',
    'confirming',
    'completed',
  ];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

  return {
    transactionId,
    status: randomStatus,
    updatedAt: new Date().toISOString(),
    message:
      randomStatus === 'completed'
        ? 'Transaction completed successfully'
        : randomStatus === 'confirming'
        ? 'Waiting for blockchain confirmations'
        : 'Transaction is processing',
    confirmations: randomStatus === 'confirming' ? 1 : randomStatus === 'completed' ? 3 : undefined,
    requiredConfirmations: 3,
    estimatedTimeRemaining: randomStatus === 'confirming' ? 420 : undefined,
    blockExplorerUrl: 'https://etherscan.io/tx/0x...',
  };
}

export const mockGetTransactionHistory = (
  limit: number = 20,
  offset: number = 0
): TransactionHistory[] => {
  const history: TransactionHistory[] = [];
  const types = ['fiat_to_crypto', 'crypto_to_fiat', 'fiat_to_stablecoin', 'crypto_to_crypto'];
  
  for (let i = offset; i < offset + limit; i++) {
    const conversionType = types[i % types.length] as any;
    history.push({
      transactionId: `TX-${1000 + i}`,
      fromCurrency: i % 4 === 0 ? 'USD' : i % 4 === 1 ? 'BTC' : i % 4 === 2 ? 'USD' : 'ETH',
      toCurrency: i % 4 === 0 ? 'BTC' : i % 4 === 1 ? 'USD' : i % 4 === 2 ? 'USD-X' : 'BTC',
      fromAmount: i % 4 === 1 ? 0.015 : 1000,
      toAmount: i % 4 === 0 ? 0.015 : i % 4 === 1 ? 1000 : i % 4 === 2 ? 1000 : 0.028,
      status: 'completed',
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
      completedAt: new Date(Date.now() - i * 86400000 + 600000).toISOString(),
      direction: i % 2 === 0 ? 'sent' : 'received',
      conversionType,
      exchangeRate: i % 4 === 0 ? 67000 : i % 4 === 1 ? 0.0000149 : 1,
      executionVenue: 'Coinbase',
      networkFee: i % 4 !== 2 ? 15 : undefined,
      txHash: i % 4 !== 2 ? '0x' + Math.random().toString(16).substr(2, 64) : undefined,
    });
  }
  return history;
}

export const mockGetWallets = (): Wallet[] => {
  return [
    // Fiat wallets
    {
      id: 'wallet-usd',
      currency: 'USD',
      type: 'fiat',
      balance: 5000,
      available: 4500,
      pending: 500,
      lastUpdated: new Date().toISOString(),
    },
    {
      id: 'wallet-eur',
      currency: 'EUR',
      type: 'fiat',
      balance: 2000,
      available: 2000,
      lastUpdated: new Date().toISOString(),
    },
    {
      id: 'wallet-gbp',
      currency: 'GBP',
      type: 'fiat',
      balance: 1500,
      available: 1400,
      lastUpdated: new Date().toISOString(),
    },
    // Crypto wallets
    {
      id: 'wallet-btc',
      currency: 'BTC',
      type: 'crypto',
      balance: 0.5,
      available: 0.48,
      pending: 0.02,
      address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      network: 'bitcoin',
      tier: 'hot',
      lastUpdated: new Date().toISOString(),
    },
    {
      id: 'wallet-eth',
      currency: 'ETH',
      type: 'crypto',
      balance: 10,
      available: 9.5,
      pending: 0.5,
      address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      network: 'ethereum',
      tier: 'hot',
      lastUpdated: new Date().toISOString(),
    },
    // Stablecoin wallets
    {
      id: 'wallet-usdx',
      currency: 'USD-X',
      type: 'stablecoin',
      balance: 25000,
      available: 24000,
      pending: 1000,
      address: '0x...',
      network: 'ethereum',
      tier: 'hot',
      lastUpdated: new Date().toISOString(),
    },
  ];
}

export const mockGetKYCStatus = (): KYCData => {
  return {
    status: 'approved',
    level: 2,
    verificationDate: new Date(Date.now() - 30 * 86400000).toISOString(),
    nextReviewDate: new Date(Date.now() + 330 * 86400000).toISOString(),
    documents: [
      {
        id: 'doc-1',
        type: 'passport',
        status: 'verified',
        uploadDate: new Date(Date.now() - 30 * 86400000).toISOString(),
        expiryDate: new Date(Date.now() + 3650 * 86400000).toISOString(),
      },
      {
        id: 'doc-2',
        type: 'address_proof',
        status: 'verified',
        uploadDate: new Date(Date.now() - 25 * 86400000).toISOString(),
      },
    ],
    limits: {
      dailyLimit: 50000,
      monthlyLimit: 200000,
      singleTransactionLimit: 10000,
      remainingDaily: 35000,
      remainingMonthly: 180000,
    },
  };
}

export const mockGetStablecoinBalance = (): StablecoinBalance => {
  return {
    total: 35000,
    byChain: {
      'ethereum-mainnet': {
        balance: 20000,
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      },
      'ethereum-l2': {
        balance: 10000,
        address: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
        contractAddress: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
      },
      'solana-mainnet': {
        balance: 5000,
        address: 'So11111111111111111111111111111111111111112',
        contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
    },
  };
}

export const mockGetReserveStatus = (): ReserveStatus => {
  return {
    totalSupply: 1000000,
    totalReserves: 1050000,
    reserveRatio: 1.05,
    lastReconciliation: new Date(Date.now() - 3600000).toISOString(),
    proofOfReserves: 'https://auditor.example.com/por-2024-11',
    composition: {
      cash: 800000,
      cashEquivalents: 200000,
      treasuryBills: 50000,
    },
  };
}

export const mockGetOrderBookDepth = (from: string, to: string): OrderBookDepth => {
  const midPrice = from === 'BTC' && to === 'USD' ? 67000 : from === 'ETH' && to === 'USD' ? 3500 : 145;
  return {
    bids: [
      [midPrice - 10, 5],
      [midPrice - 20, 10],
      [midPrice - 30, 15],
    ],
    asks: [
      [midPrice + 10, 5],
      [midPrice + 20, 10],
      [midPrice + 30, 15],
    ],
    spread: 20,
    midPrice,
    venue: 'Coinbase',
    timestamp: new Date().toISOString(),
  };
}

export const mockGetLiquiditySources = (): LiquiditySource[] => {
  return [
    {
      venue: 'Coinbase',
      type: 'exchange',
      available: true,
      latency: 120,
      feeTier: 0.5,
      minAmount: 10,
      maxAmount: 1000000,
    },
    {
      venue: 'Internal Pool',
      type: 'internal',
      available: true,
      latency: 50,
      feeTier: 0.1,
      minAmount: 1,
      maxAmount: 50000,
    },
    {
      venue: 'OTC Desk',
      type: 'otc',
      available: true,
      latency: 300,
      feeTier: 0.25,
      minAmount: 100000,
    },
  ];
}