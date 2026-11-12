import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
  setData: (next: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Minimal fetch-on-mount hook for screens that don't need a store: loading /
 * error / data plus reload. Stale responses (deps changed mid-flight) are
 * dropped.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(undefined);
    loadRef.current().then(
      (value) => live && (setData(value), setLoading(false)),
      (err) => live && (setError(err), setLoading(false)),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData: setData as AsyncState<T>['setData'] };
}

/** Polls `load` every `intervalMs` until `done(value)` is true. */
export function usePolling<T>(load: (() => Promise<T>) | null, intervalMs: number, done: (value: T) => boolean) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    if (!load) return;
    let live = true;
    let timer: number | undefined;
    const tick = () =>
      load().then(
        (value) => {
          if (!live) return;
          setData(value);
          setError(undefined);
          if (!done(value)) timer = window.setTimeout(tick, intervalMs);
        },
        (err) => {
          if (!live) return;
          setError(err);
          timer = window.setTimeout(tick, intervalMs * 2);
        },
      );
    tick();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, intervalMs]);
  return { data, error };
}
