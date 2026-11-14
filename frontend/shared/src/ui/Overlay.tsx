import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '../lib/cx';
import { Button, IconButton, type ButtonVariant } from './Button';
import { Callout } from './Feedback';
import { Field, Textarea } from './Form';

/**
 * Native <dialog>: focus trap, Esc and the inert backdrop come from the
 * browser. `onClose` fires for Esc and the close button alike.
 */
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' };
  return (
    <dialog
      ref={ref}
      onCancel={(e) => (e.preventDefault(), onClose())}
      className={cx('m-auto w-[calc(100%-32px)] rounded-panel border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-navy/40 backdrop:backdrop-blur-[2px]', widths[size])}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col animate-pop">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <h2 className="text-lg font-extrabold tracking-tight text-navy">{title}</h2>
            <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
              <X className="size-5" aria-hidden />
            </IconButton>
          </div>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/**
 * The confirm step every sensitive action goes through: it spells out what
 * will happen (`consequence`), optionally demands a reason (freeze, reject,
 * reversal and blacklist are logged with one), and stays pessimistic — the
 * button spins until the server answers, and errors render in place.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  consequence,
  confirmLabel = 'Confirm',
  variant = 'primary',
  requireReason,
  reasonLabel = 'Reason',
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  consequence?: ReactNode;
  confirmLabel?: ReactNode;
  variant?: ButtonVariant;
  requireReason?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setBusy(false);
    }
  }, [open]);
  const submit = async () => {
    if (requireReason && reason.trim().length < 5) return setError('Give a reason of at least a few words — it goes into the audit trail.');
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={variant} onClick={submit} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {children}
        {consequence && <Callout tone="warn" title="What this does">{consequence}</Callout>}
        {requireReason && (
          <Field label={reasonLabel} hint="Recorded with your name in the audit trail.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </Field>
        )}
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}

/** Right-hand detail drawer for list → detail flows in the console. */
export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <button type="button" aria-label="Close panel" className="absolute inset-0 cursor-default bg-navy/30" onClick={onClose} />
      <aside className="relative m-2 flex w-full max-w-xl flex-col overflow-hidden rounded-panel bg-surface shadow-pop animate-pop sm:m-4">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <h2 className="text-lg font-extrabold tracking-tight text-navy">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
            <X className="size-5" aria-hidden />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </aside>
    </div>
  );
}
