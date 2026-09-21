import type { ConversionState } from "../types/conversion";

// Load cache on startup
export const loadCacheFromStorage = (): ConversionState['quoteCache'] => {
  try {
    const cached = sessionStorage.getItem('quote_cache');
    if (!cached) return {};
    
    const parsed = JSON.parse(cached);
    const QUOTE_TTL = 5 * 60 * 1000; // 5 minutes
    
    // Filter out expired quotes
    return Object.entries(parsed).reduce((acc, [key, value]: [string, any]) => {
      if (Date.now() - value.cachedAt < QUOTE_TTL) {
        acc[key] = value;
      }
      return acc;
    }, {} as ConversionState['quoteCache']);
  } catch {
    return {};
  }
};