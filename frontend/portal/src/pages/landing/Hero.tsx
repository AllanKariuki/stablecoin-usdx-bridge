import { useEffect, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { useAuth } from '@damp/web-shared/auth';
import { Button, Logo, Marquee, Sparkline, useReducedMotion } from '@damp/web-shared/ui';
import { HERO_STEP_LABELS, HERO_TOTAL, HERO_USDX, NAV_LINKS, PROMISES, TAPE, type TapeLine } from './content';

const STEP_MS = 1800;

const sideColor = (side: TapeLine['side']) => (side === 'DR' ? 'text-cyan' : side === 'CR' ? 'text-[#FFB27A]' : 'text-white');

function Header() {
  const { login, register } = useAuth();
  return (
    <header className="relative flex flex-wrap items-center justify-between gap-4">
      <Logo size={40} subtitle="Self-Service" inverted />
      <nav aria-label="Main" className="hidden items-center gap-7 text-sm font-semibold md:flex">
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} className="text-on-navy-muted no-underline transition-colors hover:text-white">
            {l.label}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void login({ returnTo: '/home' })}
          className="min-h-11 cursor-pointer rounded-control px-4 text-sm font-semibold text-on-navy-muted hover:bg-white/10 hover:text-white"
        >
          Sign in
        </button>
        <Button variant="primary" onClick={() => void register({ returnTo: '/home' })}>
          Open an account
        </Button>
      </div>
    </header>
  );
}

function Preview({ step }: { step: number }) {
  const wallets = [
    { label: 'USD wallet', amount: '$2,480.00', tag: 'USD' },
    { label: 'USD-X · Ethereum', amount: HERO_USDX[step], tag: 'ETH' },
    { label: 'EUR wallet', amount: '€310.50', tag: 'EUR' },
    { label: 'KES wallet', amount: 'KSh 18,900', tag: 'KES' },
  ];
  return (
    <div aria-hidden className="relative px-2 pb-10 pt-7">
      <div className="rounded-[28px] border border-white/12 bg-white/6 p-3 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.55)]">
        <div className="grid grid-cols-2 gap-3 rounded-[20px] bg-canvas p-4 text-ink">
          <div className="col-span-2 flex items-center justify-between">
            <span className="text-[13px] font-bold text-navy">Good morning, Wanjiru</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-tint px-2.5 py-1 text-[11px] font-bold text-cyan-ink">
              <span className="size-[7px] rounded-full bg-cyan animate-live" />
              Tier 2 · Verified
            </span>
          </div>
          <div className="col-span-2 flex items-end justify-between gap-3 rounded-[18px] bg-navy p-4 text-white">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-semibold text-on-navy-subtle">Total balance</span>
              <span className="text-[32px] font-extrabold leading-none tracking-tight">{HERO_TOTAL[step]}</span>
              <span className="text-[11.5px] font-semibold text-cyan">USD + USD-X, at 1 : 1</span>
            </div>
            <Sparkline points={[10, 14, 12, 24, 21, 32, 29, 42, 46]} width={150} height={54} stroke="#1FD3E6" fill />
          </div>
          {wallets.map((w) => (
            <div key={w.label} className="flex flex-col gap-1 rounded-[16px] border border-line bg-white p-3">
              <span className="flex items-center justify-between text-[11px] font-semibold text-muted">
                <span>{w.label}</span>
                <span className="rounded-md bg-action-tint px-1.5 py-0.5 font-mono text-[10px] text-action-ink">{w.tag}</span>
              </span>
              <span className="text-lg font-extrabold tracking-tight text-navy">{w.amount}</span>
            </div>
          ))}
          <div className="col-span-2 flex flex-col gap-2.5 rounded-[16px] border border-line bg-white p-3.5">
            <span className="flex justify-between text-xs font-bold">
              <span>Issuing 500.00 USD-X</span>
              <span className="font-mono font-medium text-muted">step {step + 1} of 4</span>
            </span>
            <span className="grid grid-cols-4 gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`h-1.5 rounded-full transition-colors ${i <= step ? 'bg-action' : 'bg-line'}`} />
              ))}
            </span>
            <span className="flex justify-between text-[11px] text-muted">
              <span className="font-semibold text-action-ink">{HERO_STEP_LABELS[step]}</span>
              <span className="font-mono">0x9f3a…c21e</span>
            </span>
          </div>
        </div>
      </div>

      <div className="absolute left-0 top-0 flex animate-float items-center gap-2.5 rounded-2xl bg-white px-3.5 py-2.5 text-ink shadow-[0_18px_40px_-16px_rgba(0,0,0,0.45)]">
        <span className="grid size-8 place-items-center rounded-[10px] bg-action-tint text-action">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </span>
        <span className="flex flex-col gap-0.5 text-xs font-bold">
          Money landed
          <span className="text-[11px] font-semibold text-action-ink">+$1,000.00 from your bank</span>
        </span>
      </div>

      <div className="absolute -right-4 bottom-2 flex animate-float items-center gap-2.5 rounded-2xl border border-white/16 bg-navy-800 px-3.5 py-2.5 text-white shadow-[0_18px_40px_-16px_rgba(0,0,0,0.5)]">
        <span className="size-2.5 rounded-full bg-cyan animate-live" />
        <span className="text-xs font-semibold">
          Reserves reconciled
          <span className="ml-1.5 font-mono text-[10.5px] text-on-navy-subtle">supply = ledger</span>
        </span>
      </div>
    </div>
  );
}

export default function Hero() {
  const { register } = useAuth();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % 4), STEP_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <section aria-labelledby="hero-h" className="relative overflow-hidden rounded-shell bg-navy text-white">
      <svg aria-hidden width="820" height="820" viewBox="0 0 200 200" className="pointer-events-none absolute -right-[300px] -top-[280px] opacity-[0.13] animate-spin-slow">
        <rect x="45" y="45" width="80" height="80" rx="10" transform="rotate(45 85 85)" fill="none" stroke="#1FD3E6" strokeWidth="2.5" />
        <rect x="75" y="75" width="80" height="80" rx="10" transform="rotate(45 115 115)" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />
      </svg>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)', backgroundSize: '26px 26px' }}
      />

      <div className="relative px-5 pt-5 sm:px-10 sm:pt-7 lg:px-14">
        <Header />

        <div className="relative mt-12 grid items-center gap-12 pb-16 lg:mt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div className="flex flex-col gap-6">
            <span className="animate-rise inline-flex w-fit items-center gap-2.5 rounded-full border border-white/16 bg-white/7 px-3.5 py-1.5 text-xs font-semibold text-on-navy-muted">
              <span className="rounded-full bg-cyan px-2 py-0.5 text-[10.5px] font-extrabold tracking-wide text-navy">1 : 1</span>
              Reserve-backed digital dollars on Ethereum and Solana
            </span>
            <h1 id="hero-h" className="animate-rise stagger-1 m-0 max-w-xl text-[42px] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-[56px] lg:text-[64px]">
              Dollars you can hold, move and <span className="text-shine">verify</span>.
            </h1>
            <p className="animate-rise stagger-2 m-0 max-w-xl text-[17px] leading-relaxed text-on-navy-muted">
              Keep USD, EUR and KES next to USD-X. Turn fiat into on-chain dollars in minutes, send them anywhere, and redeem them back to your bank. Every step lands on a ledger built to be audited.
            </p>
            <div className="animate-rise stagger-3 flex flex-wrap gap-3">
              <Button
                size="lg"
                className="nudge shadow-[0_10px_30px_-10px_rgba(20,99,214,0.8)]"
                onClick={() => void register({ returnTo: '/home' })}
                iconRight={<ArrowRight className="size-4" aria-hidden />}
              >
                Open a free account
              </Button>
              <a
                href="#how"
                className="inline-flex min-h-13 items-center gap-2.5 rounded-2xl border border-white/22 px-5 text-[15px] font-bold text-white no-underline hover:bg-white/10"
              >
                See how it works
              </a>
            </div>
            <ul className="animate-rise stagger-4 m-0 flex list-none flex-col gap-2.5 p-0 text-sm text-[#e4ebfa]">
              {PROMISES.map((p) => (
                <li key={p} className="flex items-center gap-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-cyan/20">
                    <Check className="size-3.5 text-cyan" strokeWidth={3} aria-hidden />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div className="animate-rise stagger-5">
            <Preview step={step} />
          </div>
        </div>
      </div>

      <div className="relative border-t border-white/10 bg-black/15 py-3.5">
        <Marquee durationS={48}>
          {TAPE.map((e, i) => (
            <span key={i} className="inline-flex items-center gap-2.5 px-5 font-mono text-xs text-on-navy-subtle">
              <span className={`font-semibold ${sideColor(e.side)}`}>{e.side}</span>
              <span className="text-white">{e.acct}</span>
              <span>{e.amt}</span>
              <span className="text-[#5f75b0]">·</span>
              <span>{e.ref}</span>
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
