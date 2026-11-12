import { ledgerApi, type Wallet } from '@damp/web-shared/api';
import { useAsync } from '@damp/web-shared/lib';

/** The caller's wallets, freshly loaded per screen (balances move; don't cache them across pages). */
export function useWallets() {
  return useAsync<Wallet[]>(() => ledgerApi.wallets());
}

/** "USD · Main — $1,250.00", for selects where only text is allowed. */
export const walletOptionLabel = (w: Wallet) =>
  `${w.currency}${w.chain ? ` (${w.chain.toLowerCase()})` : ''} · ${w.label || 'Wallet'} — ${w.balance.display}`;

export const isFrozen = (w: Wallet) => w.status.toUpperCase() === 'FROZEN';
