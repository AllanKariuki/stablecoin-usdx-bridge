import { ArrowRight, Eye, Link2, Lock, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '@damp/web-shared/auth';
import { cx } from '@damp/web-shared/lib';
import { DecorDiamonds, Logo } from '@damp/web-shared/ui';
import { STAFF_ROLES, WORKSPACE_META, type Workspace } from '../workspace-config';
import { STORAGE_KEY } from '../workspace-context';

/** The portal owns 5173 (the console's redirect target for customer accounts). */
export const PORTAL_URL = 'http://localhost:5173';

const PILLS = [
  { icon: ShieldCheck, text: 'Role-scoped workspaces' },
  { icon: Link2, text: 'Hash-chained audit log' },
  { icon: Users, text: 'Four-eyes approvals' },
  { icon: Eye, text: 'Read-only auditors' },
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

const remember = (w: Workspace) => {
  try {
    localStorage.setItem(STORAGE_KEY, w);
  } catch {
    /* a remembered workspace is a convenience; private mode just forgets it */
  }
};

/**
 * The anonymous staff entry — no live status, queue counts or sample data.
 * Tamasha's sign-in idiom: a full-bleed visual panel with the headline
 * anchored at the bottom over a scrim, and a rounded sheet that slides over
 * it (from below on phones, from the side on desktop).
 */
export default function StaffEntry() {
  const { login } = useAuth();
  const signIn = (w?: Workspace) => {
    if (w) remember(w);
    void login({ returnTo: '/' });
  };

  return (
    <div className="flex min-h-dvh flex-col text-ink lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:p-4">
      <section
        aria-labelledby="sys-h"
        className="relative flex h-[42vh] min-h-[320px] flex-col overflow-hidden bg-navy text-white lg:sticky lg:top-4 lg:h-[calc(100dvh-32px)] lg:rounded-[32px]"
      >
        <DecorDiamonds size={760} className="absolute -right-[260px] -top-[220px] opacity-[0.14]" />
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
        <div aria-hidden className="pointer-events-none absolute -left-32 top-1/3 size-[420px] rounded-full bg-cyan/20 blur-[110px]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07133a] via-navy/30 to-transparent" />

        <header className="relative p-5 sm:p-8">
          <Logo size={40} subtitle="Ops Console" inverted />
        </header>

        <ul className="relative m-0 hidden list-none flex-wrap gap-2.5 px-8 lg:flex">
          {PILLS.map((p, i) => (
            <li
              key={p.text}
              className={cx('animate-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 py-2 pr-4 pl-2 text-sm font-medium backdrop-blur-md', `stagger-${i + 1}`)}
            >
              <span className="grid size-7 place-items-center rounded-full bg-cyan/20 text-cyan">
                <p.icon className="size-3.5" aria-hidden />
              </span>
              {p.text}
            </li>
          ))}
        </ul>

        <div className="animate-rise relative mt-auto flex flex-col gap-3 p-5 pb-12 sm:p-8 sm:pb-14 lg:p-10">
          <p className="eyebrow m-0 text-cyan">DAMP back office</p>
          <h1 id="sys-h" className="m-0 max-w-[560px] text-[32px] leading-[1.02] sm:text-[44px] lg:text-[54px]">
            The back office for every dollar we hold.
          </h1>
          <p className="m-0 hidden max-w-[500px] text-base leading-relaxed text-on-navy-muted sm:block">
            Compliance, treasury, admin and audit, each in its own workspace. You see only what your role allows, and every action you take is signed into the audit chain.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="in-h"
        className="relative z-10 -mt-6 flex flex-1 flex-col gap-7 rounded-t-[2rem] bg-surface px-5 pt-8 pb-10 shadow-card sm:px-10 lg:my-6 lg:-ml-10 lg:mt-6 lg:self-center lg:rounded-[32px] lg:px-12 lg:py-12"
      >
        <div className="animate-rise flex flex-col gap-2.5">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-warn-tint px-3 py-1 text-xs font-semibold text-warn-ink">
            <Lock className="size-3.5" aria-hidden />
            Staff only
          </span>
          <h2 id="in-h" className="m-0 text-[30px] leading-tight text-navy sm:text-[34px]">
            Sign in to your workspace
          </h2>
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
          onClick={() => signIn()}
          className="nudge animate-rise stagger-1 shadow-float flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-full bg-action text-base font-semibold text-white transition-colors hover:bg-action-hover"
        >
          <ShieldCheck className="size-5" aria-hidden />
          Continue with company sign-in
        </button>

        <div className="animate-rise stagger-2 flex flex-col gap-3">
          <p className="eyebrow m-0">Where you will land</p>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {STAFF_ROLES.map((w) => {
              const meta = WORKSPACE_META[w];
              return (
                <li key={w}>
                  <button
                    type="button"
                    onClick={() => signIn(w)}
                    title={`Sign in and open the ${meta.label} workspace`}
                    className="nudge lift flex w-full cursor-pointer items-center gap-4 rounded-[22px] border border-line bg-canvas p-4 text-left"
                  >
                    <span className={cx('grid size-11 shrink-0 place-items-center rounded-full', WORKSPACE_TONE[w])}>
                      <meta.icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-navy">{meta.label}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">{meta.blurb}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-subtle" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="animate-rise stagger-3 mt-auto flex flex-col gap-2">
          <p className="eyebrow m-0">Before you start</p>
          <ul className="m-0 list-none rounded-[18px] border border-line p-0 text-[13px] text-neutral-ink">
            {NOTICES.map((n) => (
              <li key={n} className="flex items-start gap-2.5 border-b border-line px-3.5 py-3 last:border-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B4530A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0">
                  <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                </svg>
                {n}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
