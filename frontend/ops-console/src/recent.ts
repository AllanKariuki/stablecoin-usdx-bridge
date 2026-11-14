/** Recently opened ids per lookup kind, on this device only (a convenience, never relied on). */
export type LookupKind = 'wallet' | 'transaction';

const KEYS: Record<LookupKind, string> = {
  wallet: 'damp.ops.recent.wallets',
  transaction: 'damp.ops.recent.transactions',
};

export function readRecent(kind: LookupKind): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEYS[kind]) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function rememberRecent(kind: LookupKind, id: string) {
  try {
    localStorage.setItem(KEYS[kind], JSON.stringify([id, ...readRecent(kind).filter((v) => v !== id)].slice(0, 8)));
  } catch {
    /* convenience only */
  }
}
