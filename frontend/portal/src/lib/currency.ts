import type { Wallet } from '@damp/web-shared/api';

/** The assets the portal knows how to draw — fixed glyphs and colours, never by rank. */
export interface CurrencyMeta {
  glyph: string;
  name: string;
  /** Circle background (USD-X is navy with a cyan glyph — the ledger mark). */
  color: string;
  onColor: string;
  /** KSh-style text glyphs render smaller than single characters. */
  small?: boolean;
}

export const CURRENCY_META: Record<string, CurrencyMeta> = {
  USD: { glyph: '$', name: 'US Dollar', color: '#1463D6', onColor: '#FFFFFF' },
  EUR: { glyph: '€', name: 'Euro', color: '#22398A', onColor: '#FFFFFF' },
  GBP: { glyph: '£', name: 'British Pound', color: '#0B6B78', onColor: '#FFFFFF' },
  KES: { glyph: 'KSh', name: 'Kenyan Shilling', color: '#B4530A', onColor: '#FFFFFF', small: true },
  BTC: { glyph: '₿', name: 'Bitcoin', color: '#D97706', onColor: '#FFFFFF' },
  ETH: { glyph: 'Ξ', name: 'Ethereum', color: '#6D4ED8', onColor: '#FFFFFF' },
  SOL: { glyph: '◎', name: 'Solana', color: '#0E9F8E', onColor: '#FFFFFF' },
  USDX: { glyph: 'X', name: 'USD-X', color: '#0E2463', onColor: '#1FD3E6' },
};

export const currencyMeta = (code: string): CurrencyMeta => CURRENCY_META[code] ?? { glyph: code.slice(0, 2), name: code, color: '#56627A', onColor: '#FFFFFF', small: code.length > 2 };

/** Which Wallets-page section a wallet belongs in. */
export type WalletSection = 'fiat' | 'crypto' | 'usdx';

export const SECTION_LABEL: Record<WalletSection, string> = { fiat: 'Fiat', crypto: 'Crypto', usdx: 'USD-X' };

/** kind comes from GET /currencies (FIAT | CRYPTO); USD-X is its own section. */
export const walletSection = (wallet: Pick<Wallet, 'currency'>): WalletSection =>
  wallet.currency === 'USDX' ? 'usdx' : wallet.currency === 'BTC' || wallet.currency === 'ETH' || wallet.currency === 'SOL' ? 'crypto' : 'fiat';
