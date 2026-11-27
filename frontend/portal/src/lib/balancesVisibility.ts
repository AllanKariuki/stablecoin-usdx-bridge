import { useSyncExternalStore } from 'react';

/**
 * The show/hide-balances eye, persisted in localStorage (wrapped in
 * try/catch — private browsing throws) and shared across pages through a
 * module-level subscription, so the dashboard and the Wallets page always
 * agree.
 */
const KEY = 'portal.hide-balances';

const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

let hidden = read();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => hidden;

export function toggleBalancesHidden(): boolean {
  hidden = !hidden;
  try {
    if (hidden) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Persistence is a nicety; hiding still works for this page.
  }
  listeners.forEach((l) => l());
  return hidden;
}

/** Test helper: localStorage.clear() doesn't reset the module store. */
export function resetBalancesVisibility() {
  hidden = false;
  listeners.forEach((l) => l());
}

export const useBalancesHidden = () => useSyncExternalStore(subscribe, getSnapshot);
