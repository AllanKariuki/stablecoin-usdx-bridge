import { useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, XOctagon } from 'lucide-react';
import { cx } from '../lib/cx';

type ToastTone = 'success' | 'danger' | 'info';

interface ToastItem {
  id: number;
  message: ReactNode;
  tone: ToastTone;
}

/**
 * One lightweight toast at a time, driven imperatively (`toast('…')`)
 * through a module-level subscription — no provider, no store. Mount
 * <Toasts /> once per app (the portal puts it in its layout); the newest
 * message replaces the one on screen and auto-dismisses after 4s.
 */
let nextId = 1;
let current: ToastItem | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function toast(message: ReactNode, tone: ToastTone = 'success') {
  current = { id: nextId++, message, tone };
  emit();
}

const TONES: Record<ToastTone, { box: string; icon: ReactNode }> = {
  success: { box: 'border-cyan/40 bg-cyan-tint text-cyan-ink', icon: <CheckCircle2 className="size-5 text-cyan-ink" aria-hidden /> },
  danger: { box: 'border-danger-line bg-danger-tint text-danger-ink', icon: <XOctagon className="size-5 text-danger" aria-hidden /> },
  info: { box: 'border-action/20 bg-action-tint text-action-ink', icon: <Info className="size-5 text-action" aria-hidden /> },
};

export function Toasts() {
  const [item, setItem] = useState<ToastItem | null>(current);
  useEffect(() => {
    const l = () => setItem(current);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (!item) return;
    const timer = window.setTimeout(() => setItem((it) => (it?.id === item.id ? null : it)), 4000);
    return () => window.clearTimeout(timer);
  }, [item]);
  if (!item) return null;
  const s = TONES[item.tone];
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4" role="status" aria-live="polite">
      <div className={cx('flex max-w-md items-center gap-3 rounded-panel border px-4 py-3 shadow-pop animate-pop', s.box)}>
        {s.icon}
        <p className="text-sm font-semibold">{item.message}</p>
      </div>
    </div>
  );
}
