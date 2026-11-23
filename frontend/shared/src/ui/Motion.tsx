import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../lib/cx';

/** True when the user has asked for reduced motion. Test-safe: no `matchMedia` → false. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts a NUMBER from 0 to `value` over `durationMs`. Counts and percentages
 * only — never Money. Money renders from the server's `display` string via
 * `MoneyText`; do not pass a `Money` amount in here.
 */
export function CountUp({
  value,
  format,
  durationMs = 1200,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const current = from + (value - from) * easeOutCubic(t);
      fromRef.current = current;
      setShown(current);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, durationMs, reduced]);

  return <span className={cx('tabular-nums', className)}>{format ? format(shown) : shown.toLocaleString('en-US')}</span>;
}

/** Normalised polyline with a draw-in. Decorative unless `label` is given. */
export function Sparkline({
  points,
  width = 160,
  height = 40,
  stroke = '#1463D6',
  fill = false,
  className,
  label,
}: {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: boolean;
  className?: string;
  label?: string;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 3;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (p: number) => height - pad - ((p - min) / span) * (height - pad * 2);
  const polyline = points.map((p, i) => `${x(i).toFixed(2)},${y(p).toFixed(2)}`).join(' ');
  const area = `${pad},${height - pad} ${polyline} ${width - pad},${height - pad}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {fill && <polygon points={area} fill={stroke} fillOpacity="0.14" />}
      <polyline
        points={polyline}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset="0"
        className="animate-draw"
      />
    </svg>
  );
}

/** Animated coverage/ratio ring with a centred label. `ratio` is clamped to 1. */
export function ProgressRing({
  ratio,
  size = 132,
  stroke = 14,
  label,
  sublabel,
  color = '#1463D6',
  track = '#E8F1FE',
  ariaLabel,
}: {
  ratio: number;
  size?: number;
  stroke?: number;
  label: ReactNode;
  sublabel?: ReactNode;
  color?: string;
  track?: string;
  ariaLabel?: string;
}) {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const r = (size - stroke) / 2;
  const center = size / 2;
  const accessible = ariaLabel ?? (typeof label === 'string' || typeof label === 'number' ? String(label) : undefined);

  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="col-start-1 row-start-1"
        role={accessible ? 'img' : undefined}
        aria-label={accessible}
        aria-hidden={accessible ? undefined : true}
      >
        <circle cx={center} cy={center} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${clamped} 1`}
          transform={`rotate(-90 ${center} ${center})`}
          className="animate-ring"
        />
      </svg>
      <div aria-hidden={accessible ? true : undefined} className="col-start-1 row-start-1 flex flex-col items-center gap-0.5 px-2 text-center">
        <span className="text-[22px] font-extrabold leading-none tracking-tight text-navy">{label}</span>
        {sublabel != null && <span className="text-[11px] font-semibold text-muted">{sublabel}</span>}
      </div>
    </div>
  );
}

/** Small pulsing status dot (bare; pair it with a label as needed). */
export function PulseDot({ tone = 'cyan', className }: { tone?: 'cyan' | 'warn'; className?: string }) {
  return <span aria-hidden className={cx('inline-block size-2 rounded-full animate-live', tone === 'warn' ? 'bg-warn' : 'bg-cyan', className)} />;
}

/** Infinite horizontal tape: children rendered twice, pauses on hover. */
export function Marquee({
  children,
  className,
  durationS = 48,
  decorative = true,
}: {
  children: ReactNode;
  className?: string;
  durationS?: number;
  decorative?: boolean;
}) {
  return (
    <div className={cx('overflow-hidden', className)} aria-hidden={decorative || undefined}>
      <div className="flex w-max animate-tape hover:[animation-play-state:paused]" style={{ animationDuration: `${durationS}s` }}>
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The two rotated diamond rects used behind the AppShell and hero. */
export function DecorDiamonds({
  size = 720,
  className,
  tone = 'dark',
  spin = true,
}: {
  size?: number;
  className?: string;
  tone?: 'dark' | 'light';
  spin?: boolean;
}) {
  const dark = tone === 'dark';
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden className={cx('pointer-events-none', spin && 'animate-spin-slow', className)}>
      <rect x="45" y="45" width="80" height="80" rx="10" transform="rotate(45 85 85)" fill="none" stroke={dark ? '#1FD3E6' : '#FFFFFF'} strokeWidth="2.5" />
      <rect x="75" y="75" width="80" height="80" rx="10" transform="rotate(45 115 115)" fill="none" stroke={dark ? '#FFFFFF' : '#1FD3E6'} strokeWidth="2.5" />
    </svg>
  );
}
