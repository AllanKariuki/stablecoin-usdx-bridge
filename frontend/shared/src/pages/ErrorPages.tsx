import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Lock, ServerCrash, WifiOff } from 'lucide-react';
import { Button, buttonClass } from '../ui/Button';
import { Logo } from '../ui/Logo';

type Action = { label: string; href?: string; to?: string; onClick?: () => void };

function ActionButton({ action, variant }: { action: Action; variant: 'primary' | 'secondary' }) {
  if (action.onClick) return <Button variant={variant} onClick={action.onClick}>{action.label}</Button>;
  if (action.href) return <a className={buttonClass(variant, 'md', 'no-underline')} href={action.href}>{action.label}</a>;
  return <Link className={buttonClass(variant, 'md', 'no-underline')} to={action.to ?? '/'}>{action.label}</Link>;
}

/**
 * Full-page system state (404, 403, 500, offline, sign-in failure). Defence
 * in depth for stale links and forged deep links: they land somewhere
 * legible with a way out, never a blank screen.
 */
export function ErrorPage({ code, icon, title, message, primary, secondary }: { code: string; icon?: ReactNode; title: string; message: ReactNode; primary?: Action; secondary?: Action }) {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-start gap-5 animate-rise">
        <Logo size={36} />
        <span className="grid size-16 place-items-center rounded-[22px] bg-navy text-cyan">{icon ?? <Compass className="size-7" aria-hidden />}</span>
        <div className="flex flex-col gap-2">
          <p className="eyebrow">{code}</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-navy">{title}</h1>
          <p className="text-[15px] leading-relaxed text-muted">{message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {primary && <ActionButton action={primary} variant="primary" />}
          {secondary && <ActionButton action={secondary} variant="secondary" />}
        </div>
      </div>
    </div>
  );
}

export const NotFoundPage = () => (
  <ErrorPage code="404" title="We couldn't find that page" message="The link may be old, or the page may have moved. Nothing has changed in your account." primary={{ label: 'Go to home', to: '/' }} />
);

export function ForbiddenPage({ title = "You don't have access to this", message = "Your role doesn't include this area. If you think it should, ask an administrator.", action }: { title?: string; message?: string; action?: { label: string; href: string } }) {
  return (
    <ErrorPage
      code="403"
      icon={<Lock className="size-7" aria-hidden />}
      title={title}
      message={message}
      primary={action ? { label: action.label, href: action.href } : { label: 'Go to home', to: '/' }}
    />
  );
}

export const ServerErrorPage = ({ onRetry }: { onRetry?: () => void }) => (
  <ErrorPage
    code="500"
    icon={<ServerCrash className="size-7" aria-hidden />}
    title="Something broke on our side"
    message="It's been logged. Your money and data are safe — try again in a moment."
    primary={{ label: 'Try again', onClick: onRetry ?? (() => window.location.reload()) }}
    secondary={{ label: 'Go to home', to: '/' }}
  />
);

export const OfflinePage = () => (
  <ErrorPage code="Offline" icon={<WifiOff className="size-7" aria-hidden />} title="You're offline" message="Reconnect to continue. Nothing you started was submitted twice." primary={{ label: 'Retry', onClick: () => window.location.reload() }} />
);
