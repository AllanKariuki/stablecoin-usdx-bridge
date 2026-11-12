import { ArrowRight, Check, Coins, Landmark, ShieldCheck, Waypoints } from 'lucide-react';
import { useAuth } from '@damp/web-shared/auth';
import { Button, Logo } from '@damp/web-shared/ui';

const PROMISES = [
  'Every balance is a line in a double-entry ledger you can audit.',
  'USD-X is minted only against dollars already held in reserve.',
  'Nothing moves without your confirmation, and nothing moves twice.',
];

const FEATURES = [
  { icon: Landmark, title: 'Fiat wallets', body: 'Hold USD, EUR and KES. Deposit from a linked bank or mobile money, and withdraw back to it.' },
  { icon: Coins, title: 'Issue and redeem USD-X', body: 'Turn dollars into USD-X on Ethereum or Solana, and follow every step until it’s final on chain.' },
  { icon: Waypoints, title: 'Pay and get paid', body: 'Send to saved payees, send invoices with a payment link, and get notified as soon as money lands.' },
  { icon: ShieldCheck, title: 'Verified, with clear limits', body: 'See your verification tier, what it allows, and exactly what’s needed to raise it.' },
];

/**
 * The anonymous front door. There's no password form here, by design: both
 * buttons hand off to Keycloak's hosted pages (themed to match).
 */
export default function Landing() {
  const { login, register } = useAuth();
  return (
    <div className="min-h-dvh bg-shell p-3 sm:p-4">
      <section className="relative overflow-hidden rounded-shell bg-navy px-5 pb-10 pt-5 text-white sm:px-10 sm:pb-14 lg:px-14">
        <svg aria-hidden width="720" height="720" viewBox="0 0 200 200" className="pointer-events-none absolute -right-60 -top-56 opacity-[0.14] motion-safe:animate-[spin_90s_linear_infinite]">
          <rect x="45" y="45" width="80" height="80" transform="rotate(45 85 85)" fill="none" stroke="#1FD3E6" strokeWidth="2.5" />
          <rect x="75" y="75" width="80" height="80" transform="rotate(45 115 115)" fill="none" stroke="#fff" strokeWidth="2.5" />
        </svg>

        <header className="relative flex items-center justify-between gap-4">
          <Logo size={40} subtitle="Self-Service" inverted />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void login({ returnTo: '/home' })} className="min-h-11 cursor-pointer rounded-control px-4 text-sm font-semibold text-on-navy-muted hover:bg-white/10 hover:text-white">
              Sign in
            </button>
            <Button variant="primary" onClick={() => void register({ returnTo: '/home' })} className="hidden sm:inline-flex">
              Open an account
            </Button>
          </div>
        </header>

        <div className="relative mt-12 grid items-center gap-12 lg:mt-20 lg:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-6 animate-rise">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-semibold text-on-navy-muted">
              <span className="size-2 rounded-full bg-cyan animate-live" aria-hidden />
              Reserve-backed digital dollars
            </span>
            <h1 className="max-w-xl text-[40px] font-extrabold leading-[1.04] tracking-[-0.035em] sm:text-[56px]">
              Dollars you can hold, move and verify.
            </h1>
            <p className="max-w-lg text-[17px] leading-relaxed text-on-navy-muted">
              Keep fiat and USD-X side by side, move money between them in minutes, and see every step on a ledger built to be audited.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => void register({ returnTo: '/home' })} iconRight={<ArrowRight className="size-4" aria-hidden />}>
                Open a free account
              </Button>
              <button type="button" onClick={() => void login({ returnTo: '/home' })} className="inline-flex min-h-13 cursor-pointer items-center rounded-2xl border border-white/20 px-5 text-[15px] font-bold text-white hover:bg-white/10">
                I already have one
              </button>
            </div>
            <ul className="m-0 mt-2 flex list-none flex-col gap-2.5 p-0 text-sm text-[#e4ebfa]">
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

          {/* Product preview — illustrative, not live data. */}
          <div aria-hidden className="grid grid-cols-2 gap-3 [animation-delay:150ms] animate-rise">
            <div className="col-span-2 flex items-center gap-3 rounded-[20px] border border-white/14 bg-white/8 px-4 py-3.5">
              <span className="size-2.5 rounded-full bg-cyan animate-live" />
              <span className="flex-1 text-[13px] font-semibold">Reserves reconciled</span>
              <span className="font-mono text-[11px] text-on-navy-subtle">supply = ledger</span>
            </div>
            <div className="col-span-2 rounded-[24px] bg-white p-5 text-ink sm:col-span-1">
              <p className="text-xs text-muted">USD wallet</p>
              <p className="mt-1 text-[28px] font-extrabold leading-none tracking-tight text-navy">$2,480.00</p>
              <svg width="100%" height="36" viewBox="0 0 160 36" className="mt-3">
                <polyline points="0,28 20,26 40,27 60,20 80,22 100,14 120,16 140,8 160,6" fill="none" stroke="#1463D6" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="col-span-2 flex flex-col gap-2 rounded-[24px] bg-white p-5 text-ink sm:col-span-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted">Issue USD-X</p>
                <span className="rounded-full bg-cyan-tint px-2 py-0.5 text-[10px] font-bold text-cyan-ink">Final</span>
              </div>
              <p className="text-sm font-bold">500.000000 USDX minted</p>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 flex-1 rounded-full bg-action" />
                ))}
              </div>
              <p className="font-mono text-[11px] text-subtle">0x9f3a…c21e · Sepolia</p>
            </div>
            <div className="col-span-2 flex items-center justify-between gap-3 rounded-[20px] bg-white/95 px-4 py-3 text-ink">
              <span className="flex items-center gap-2.5 text-[13px] font-semibold">
                <span className="grid size-8 place-items-center rounded-[10px] bg-action-tint text-action">↓</span>
                Deposit from your bank
              </span>
              <span className="text-sm font-bold text-action-ink">+$1,000.00</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1280px] gap-4 px-1 py-10 sm:grid-cols-2 lg:grid-cols-4" aria-label="What you can do">
        {FEATURES.map((f) => (
          <article key={f.title} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6 shadow-card">
            <span className="grid size-11 place-items-center rounded-[14px] bg-action-tint text-action">
              <f.icon className="size-5" aria-hidden />
            </span>
            <h2 className="text-base font-bold text-navy">{f.title}</h2>
            <p className="text-sm leading-relaxed text-muted">{f.body}</p>
          </article>
        ))}
      </section>

      <footer className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-2 pb-6 text-xs text-subtle">
        <span>DAMP · USD-X is issued against fiat on the ledger and burned when redeemed.</span>
        <span>Staff? Use the Ops Console.</span>
      </footer>
    </div>
  );
}
