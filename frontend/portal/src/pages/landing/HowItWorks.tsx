import { useEffect, useState } from 'react';
import { cx } from '@damp/web-shared/lib';
import { useReducedMotion } from '@damp/web-shared/ui';
import { ISSUE_STEPS, REDEEM_STEPS, type FlowStep } from './content';

type Dir = 'issue' | 'redeem';

const STEP_MS = 1800;
const TABS: Array<{ id: Dir; label: string }> = [
  { id: 'issue', label: 'Issue USD-X' },
  { id: 'redeem', label: 'Redeem to dollars' },
];

function StepIcon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function HowItWorks() {
  const reduced = useReducedMotion();
  const [dir, setDir] = useState<Dir>('issue');
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % 4), STEP_MS);
    return () => window.clearInterval(id);
  }, [reduced, dir]);

  const steps: FlowStep[] = dir === 'issue' ? ISSUE_STEPS : REDEEM_STEPS;
  const pct = Math.round((step / 3) * 100);

  return (
    <section id="how" aria-labelledby="how-h" className="mx-auto flex w-full max-w-[1360px] flex-col gap-8 py-16">
      <div className="reveal flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <span className="eyebrow text-action">How money moves</span>
          <h2 id="how-h" className="m-0 text-[32px] font-extrabold leading-[1.06] tracking-[-0.035em] text-navy sm:text-[44px]">
            Four steps, each one you can watch happen.
          </h2>
        </div>
        <div role="group" aria-label="Direction" className="inline-flex gap-1 rounded-2xl border border-line bg-surface p-1.5">
          {TABS.map((t) => {
            const active = t.id === dir;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setDir(t.id);
                  setStep(0);
                }}
                className={cx(
                  'min-h-11 cursor-pointer rounded-xl border-0 px-5 text-sm font-bold transition-colors',
                  active ? 'bg-navy text-white' : 'text-neutral-ink hover:bg-canvas',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="reveal relative rounded-[28px] border border-line bg-surface p-7 sm:p-10">
        <div aria-hidden className="relative mx-[12.5%] mb-8 h-1 rounded-full bg-line">
          <div className="absolute inset-y-0 left-0 rounded-full bg-action transition-[width] duration-500" style={{ width: `${pct}%` }} />
          <span className="absolute -top-[5px] size-3.5 animate-travel rounded-full bg-cyan shadow-[0_0_0_5px_rgba(31,211,230,0.22)]" style={{ marginLeft: '-7px' }} />
        </div>

        <ol className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => {
            const active = i === step;
            const done = i < step;
            return (
              <li
                key={s.title}
                aria-current={active ? 'step' : undefined}
                className={cx(
                  'flex flex-col gap-3 rounded-[20px] border p-5 transition-colors',
                  active ? 'border-action bg-action-tint' : 'border-line bg-white',
                )}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={cx(
                      'grid size-11 place-items-center rounded-[14px] transition-colors',
                      active || done ? 'bg-action text-white' : 'bg-neutral-tint text-neutral-ink',
                    )}
                  >
                    <StepIcon d={s.icon} />
                  </span>
                  <span className="font-mono text-xs text-subtle">0{i + 1}</span>
                </span>
                <span className="text-[17px] font-extrabold text-navy">{s.title}</span>
                <span className="text-sm leading-relaxed text-muted">{s.body}</span>
                <span
                  className={cx(
                    'mt-auto w-fit rounded-lg px-2.5 py-1.5 font-mono text-[11.5px]',
                    done ? 'bg-cyan-tint text-cyan-ink' : active ? 'bg-white text-action-ink' : 'bg-canvas text-subtle',
                  )}
                >
                  {s.status}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
