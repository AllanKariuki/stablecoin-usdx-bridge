import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cx } from '../lib/cx';

export type ButtonVariant = 'primary' | 'navy' | 'secondary' | 'ghost' | 'warn' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-action text-white hover:bg-action-hover disabled:bg-action/50',
  navy: 'bg-navy text-white hover:bg-navy-800 disabled:bg-navy/50',
  secondary: 'bg-surface text-navy border border-line-strong hover:border-navy/40 hover:bg-canvas disabled:text-subtle',
  ghost: 'bg-transparent text-action hover:bg-action-tint disabled:text-subtle',
  // "Against" actions — reject, freeze, cancel — are orange, not red: they are
  // deliberate, reversible-by-process decisions, not errors.
  warn: 'bg-warn-tint text-warn-ink border border-warn-line hover:bg-warn-bg disabled:opacity-60',
  danger: 'bg-danger text-white hover:bg-danger-ink disabled:bg-danger/50',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-[13px] gap-1.5 rounded-[10px]',
  md: 'min-h-11 px-4 text-sm gap-2 rounded-control',
  lg: 'min-h-13 px-5 text-[15px] gap-2 rounded-2xl',
};

export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) =>
  cx(
    'inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors cursor-pointer disabled:cursor-not-allowed select-none',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button — money-moving submits stay pessimistic. */
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export function LinkButton({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  className,
  children,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; iconRight?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, cx('no-underline', className))} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}

/** Square icon-only button; `label` becomes its accessible name. */
export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-10 items-center justify-center rounded-control text-muted hover:bg-neutral-tint hover:text-ink transition-colors cursor-pointer',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
