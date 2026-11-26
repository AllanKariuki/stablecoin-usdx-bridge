import { Check } from 'lucide-react';
import { RESERVE_CHECKS } from './content';

function Node({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex min-w-[120px] flex-col items-center gap-1 rounded-2xl border border-white/12 bg-white/7 px-4 py-4 text-center">
      <span className="text-base font-extrabold text-white">{title}</span>
      <span className="text-xs text-on-navy-subtle">{sub}</span>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1 text-on-navy-subtle">
      <svg viewBox="0 0 48 8" preserveAspectRatio="none" className="h-2 w-12" aria-hidden="true">
        <line x1="0" y1="4" x2="48" y2="4" stroke="#1FD3E6" strokeWidth="2" pathLength="1" strokeDasharray="1" className="animate-draw" />
      </svg>
      <span className="text-[10px] font-semibold uppercase tracking-wide">matches</span>
    </div>
  );
}

/** The mechanism only — no figures (PLAN.md rule 1). The node diagram is illustrative, not a metric. */
export default function Reserves() {
  return (
    <section id="proof" aria-labelledby="proof-h" className="mx-auto w-full max-w-[1360px] py-12">
      <div className="reveal relative grid grid-cols-1 gap-10 overflow-hidden rounded-[32px] bg-navy p-7 text-white sm:p-12 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />

        <div className="relative flex flex-col gap-5">
          <span className="inline-flex items-center gap-2.5 text-[12.5px] font-extrabold uppercase tracking-[0.12em] text-cyan">Proof of reserves</span>
          <h2 id="proof-h" className="m-0 text-[32px] font-extrabold leading-[1.06] tracking-[-0.035em] sm:text-[44px]">
            Every USD-X has a dollar behind it. Check it yourself.
          </h2>
          <p className="m-0 max-w-xl text-[16.5px] leading-relaxed text-on-navy-muted">
            Treasury reconciles on-chain supply against the ledger and the custodian's statement on a schedule. If the three ever disagree, issuance stops until a person signs off.
          </p>
          <div className="mt-2 flex flex-col gap-2.5">
            {RESERVE_CHECKS.map((label) => (
              <div key={label} className="flex items-center gap-3 rounded-[14px] border border-white/10 bg-white/6 px-3.5 py-3">
                <span className="grid size-[26px] shrink-0 place-items-center rounded-lg bg-cyan/20">
                  <Check className="size-3.5 text-cyan" strokeWidth={3} aria-hidden />
                </span>
                <span className="flex-1 text-sm font-semibold">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
            <Node title="Chain" sub="on-chain supply" />
            <Connector />
            <Node title="Ledger" sub="double-entry reserve" />
            <Connector />
            <Node title="Custodian" sub="dollars held" />
          </div>
        </div>
      </div>
    </section>
  );
}
