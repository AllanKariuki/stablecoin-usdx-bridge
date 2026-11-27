import '@testing-library/jest-dom/vitest';

// recharts' ResponsiveContainer measures the DOM through ResizeObserver,
// which jsdom doesn't implement. The stub keeps charts rendering (as empty
// boxes — dimensions stay 0) without crashing the whole test.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// This jsdom/Node combination ships no localStorage (Node's experimental
// one returns undefined without --localstorage-file). Give tests an
// in-memory one so the show/hide-balances persistence can be exercised.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  class MemoryStorage implements Storage {
    get length() {
      return store.size;
    }
    clear() {
      store.clear();
    }
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    }
    key(index: number) {
      return [...store.keys()][index] ?? null;
    }
    removeItem(key: string) {
      store.delete(key);
    }
    setItem(key: string, value: string) {
      store.set(key, String(value));
    }
  }
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });
}
