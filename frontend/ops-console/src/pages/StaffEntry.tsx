import { Eye, Link2, Lock, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '@damp/web-shared/auth';
import { cx } from '@damp/web-shared/lib';
import { Logo } from '@damp/web-shared/ui';
import { STAFF_ROLES, WORKSPACE_META, type Workspace } from '../workspace-config';

/** The portal owns 5173 (the console's redirect target for customer accounts). */
export const PORTAL_URL = 'http://localhost:5173';

const HOW_IT_WORKS = [
  { icon: ShieldCheck, text: 'Role-scoped workspaces: you see only what your role allows.' },
  { icon: Link2, text: 'Every action is written to an append-only, hash-chained audit log.' },
  { icon: Users, text: 'Large moves need a second approver, and you cannot approve your own.' },
  { icon: Eye, text: 'Auditor access is read-only, with no mutating controls.' },
];

const NOTICES = [
  'Every action is recorded against your name in an append-only audit log.',
  'Moves above the approval threshold need a second person. You cannot approve your own.',
];

const WORKSPACE_TONE: Record<Workspace, string> = {
  compliance: 'bg-warn-tint text-warn',
  treasury: 'bg-action-tint text-action',
  admin: 'bg-neutral-tint text-navy',
  auditor: 'bg-cyan-tint text-cyan-ink',
};

/** The anonymous staff entry — no live status, queue counts or sample data. */
export default function StaffEntry() {
  const { login } = useAuth();

  return (
    <div className="flex min-h-dvh flex-wrap gap-3.5 bg-shell p-3.5 text-ink">
      <section aria-labelledby="sys-h" className="relative flex min-w-0 flex-1 basis-[460px] flex-col gap-6 overflow-hidden rounded-[32px] bg-navy p-6 text-white sm:p-10">
        <svg aria-hidden width="640" height="640" viewBox="0 0 200 200" className="pointer-events-none absolute -bottom-[260px] -right-[260px] opacity-10 animate-spin-slow">
          <rect x="45" y="45" width="80" height="80" rx="10" transform="rotate(45 85 85)" fill="none" stroke="#1FD3E6" strokeWidth="2.5" />
          <rect x="75" y="75" width="80" height="80" rx="10" transform="rotate(45 115 115)" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />
        </svg>
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <header className="relative">
          <Logo size={40} subtitle="Ops Console" inverted />
        </header>

        <div className="animate-rise relative flex flex-col gap-3">
          <h1 id="sys-h" className="m-0 max-w-[520px] text-[34px] font-extrabold leading-[1.04] tracking-[-0.04em] sm:text-[46px]">
            The back office for every dollar we hold.
          </h1>
          <p className="m-0 max-w-[500px] text-base leading-relaxed text-on-navy-muted">
            Compliance, treasury, admin and audit, each in its own workspace. You see only what your role allows, and every action you take is signed into the audit chain.
          </p>
        </div>

        <ul className="animate-rise stagger-2 relative m-0 flex list-none flex-col gap-3 p-0">
          {HOW_IT_WORKS.map((item) => (
            <li key={item.text} className="flex items-start gap-3 rounded-[14px] border border-white/10 bg-white/6 px-3.5 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cyan/15 text-cyan">
                <item.icon className="size-4" aria-hidden />
              </span>
              <span className="text-sm leading-relaxed text-on-navy-muted">{item.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="in-h" className="flex min-w-0 flex-1 basis-[520px] flex-col gap-6 rounded-[32px] border border-line bg-surface p-6 sm:p-12">
        <div className="animate-rise flex flex-col gap-2.5">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-warn-tint px-3 py-1 text-xs font-bold text-warn-ink">
            <Lock className="size-3.5" aria-hidden />
            Staff only
          </span>
          <h2 id="in-h" className="m-0 text-[34px] font-extrabold tracking-[-0.03em] text-navy">Sign in to your workspace</h2>
          <p className="m-0 text-[15px] leading-relaxed text-muted">
            Use your company account. Customers sign in on the{' '}
            <a href={PORTAL_URL} className="text-action underline-offset-2 hover:underline">
              Self-Service portal
            </a>
            .
          </p>
        </div>

        <button
          type="button"
          onClick={() => void login({ returnTo: '/' })}
          className="nudge animate-rise stagger-1 flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-2xl bg-navy text-base font-bold text-white"
        >
          <ShieldCheck className="size-5" aria-hidden />
          Continue with company sign-in
        </button>

        <div className="animate-rise stagger-2 flex flex-col gap-3">
          <span className="text-[13px] font-bold text-navy">Where you will land</span>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {STAFF_ROLES.map((w) => {
              const meta = WORKSPACE_META[w];
              return (
                <article key={w} className="lift flex flex-col gap-2.5 rounded-[18px] border border-line bg-canvas p-4">
                  <span className="flex items-center justify-between">
                    <span className={cx('grid size-10 place-items-center rounded-xl', WORKSPACE_TONE[w])}>
                      <meta.icon className="size-[19px]" aria-hidden />
                    </span>
                    <span className="font-mono text-[10.5px] text-subtle">{w}</span>
                  </span>
                  <span className="text-[15.5px] font-extrabold text-navy">{meta.label}</span>
                  <span className="text-[13px] leading-relaxed text-muted">{meta.blurb}</span>
                </article>
              );
            })}
          </div>
        </div>

        <ul className="animate-rise stagger-3 m-0 mt-auto flex list-none flex-col gap-2.5 border-t border-line pt-4 text-[13px] text-neutral-ink">
          {NOTICES.map((n) => (
            <li key={n} className="flex items-start gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B4530A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0">
                <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
              {n}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
