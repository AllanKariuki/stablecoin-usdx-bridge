import { ArrowRight, Check } from 'lucide-react';
import { useAuth } from '@damp/web-shared/auth';
import { BUSINESS_CONTACT, BUSINESS_POINTS, PERSONAL } from './content';

function Point({ children, tone = 'action' }: { children: string; tone?: 'action' | 'warn' }) {
  return (
    <li className="flex items-start gap-2.5">
      <Check className={`mt-0.5 size-[18px] shrink-0 ${tone === 'warn' ? 'text-warn' : 'text-action'}`} strokeWidth={2.5} aria-hidden />
      {children}
    </li>
  );
}

export default function Audiences() {
  const { register } = useAuth();
  return (
    <section id="business" aria-labelledby="who-h" className="mx-auto flex w-full max-w-[1360px] flex-col gap-8 py-16">
      <h2 id="who-h" className="reveal m-0 max-w-2xl text-[32px] font-extrabold leading-[1.06] tracking-[-0.035em] text-navy sm:text-[44px]">
        For you, and for the company you run.
      </h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="reveal lift flex flex-col gap-5 rounded-[28px] border border-line bg-surface p-7 sm:p-9">
          <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-cyan-ink">Personal</span>
          <h3 className="m-0 text-[26px] font-extrabold tracking-[-0.02em] text-navy">Hold dollars without a US bank.</h3>
          <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[15px] text-ink">
            {PERSONAL.map((p) => (
              <Point key={p}>{p}</Point>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void register({ returnTo: '/home' })}
            className="nudge mt-auto inline-flex min-h-12 w-fit cursor-pointer items-center gap-2 rounded-[14px] bg-action px-5 font-bold text-white"
          >
            Open a personal account
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </article>

        <article className="reveal lift flex flex-col gap-5 rounded-[28px] border border-line bg-surface p-7 sm:p-9">
          <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-warn">Business</span>
          <h3 className="m-0 text-[26px] font-extrabold tracking-[-0.02em] text-navy">Two keys on every big payment.</h3>
          {/* Illustrative approval example — aria-hidden, no live figures. */}
          <div aria-hidden className="flex flex-col gap-3 rounded-[18px] bg-canvas p-4">
            <span className="flex items-center justify-between text-sm font-bold text-navy">
              Payout to Acme Logistics · $18,400.00
              <span className="rounded-full bg-warn-tint px-2.5 py-1 text-[11px] font-extrabold text-warn-ink">1 of 2 approved</span>
            </span>
            <span className="flex flex-wrap gap-2.5">
              <span className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-[13px] font-semibold">
                <span className="grid size-6 place-items-center rounded-full bg-action text-[10px] font-extrabold text-white">AO</span>
                Proposed by Amina
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-dashed border-line-strong bg-white px-3 py-2 text-[13px] font-semibold text-muted">
                <span className="grid size-6 place-items-center rounded-full bg-neutral-tint text-[10px] font-extrabold text-neutral-ink">?</span>
                Waiting on a second approver
              </span>
            </span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[15px] text-ink">
            {BUSINESS_POINTS.map((p) => (
              <Point key={p} tone="warn">
                {p}
              </Point>
            ))}
          </ul>
          <a
            href={BUSINESS_CONTACT}
            className="nudge mt-auto inline-flex min-h-12 w-fit items-center gap-2 rounded-[14px] border border-line-strong px-5 font-bold text-navy no-underline hover:bg-canvas"
          >
            Talk to us about business
            <ArrowRight className="size-4" aria-hidden />
          </a>
        </article>
      </div>
    </section>
  );
}
