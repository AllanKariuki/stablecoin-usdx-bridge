import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, CircleHelp, LogOut, Settings, ShieldCheck } from 'lucide-react';
import { useAuth } from '@damp/web-shared/auth';
import { cx } from '@damp/web-shared/lib';

const initials = (name: string, email: string) => {
  const source = name.trim() || email.split('@')[0] || '?';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
};

/**
 * The top-bar profile dropdown: who is signed in, and the account links
 * (settings, verification, help, sign out). Closes on Escape, on an outside
 * click and after choosing an item; focus returns to the trigger on Escape.
 */
export default function ProfileMenu() {
  const { user, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const item = 'flex min-h-10 items-center gap-2.5 rounded-[10px] px-3 text-sm font-semibold text-ink no-underline hover:bg-canvas';

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface py-1 pr-2.5 pl-1 hover:border-action/40"
      >
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-navy text-xs font-bold text-white">
          {initials(user.name, user.email)}
        </span>
        <span className="hidden max-w-[140px] truncate text-sm font-semibold text-navy sm:block">{user.name || user.email}</span>
        <ChevronDown className={cx('size-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-64 rounded-2xl border border-line bg-surface p-2 shadow-lg">
          <div className="border-b border-line px-3 pt-1 pb-2.5">
            <p className="truncate text-sm font-bold text-navy">{user.name || 'Your account'}</p>
            <p className="truncate font-mono text-xs text-muted">{user.email}</p>
          </div>
          <div className="flex flex-col pt-1.5">
            <Link role="menuitem" to="/settings" className={item} onClick={() => setOpen(false)}>
              <Settings className="size-4 text-muted" aria-hidden /> Settings
            </Link>
            {can('kyc:submit') && (
              <Link role="menuitem" to="/verification" className={item} onClick={() => setOpen(false)}>
                <ShieldCheck className="size-4 text-muted" aria-hidden /> Verification
              </Link>
            )}
            <Link role="menuitem" to="/help" className={item} onClick={() => setOpen(false)}>
              <CircleHelp className="size-4 text-muted" aria-hidden /> Help
            </Link>
            <button role="menuitem" type="button" onClick={logout} className={cx(item, 'cursor-pointer border-0 bg-transparent text-left')}>
              <LogOut className="size-4 text-muted" aria-hidden /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
