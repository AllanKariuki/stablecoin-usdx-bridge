import { ArrowRight } from 'lucide-react';
import { useAuth } from '@damp/web-shared/auth';
import { Logo } from '@damp/web-shared/ui';
import { NAV_LINKS, OPS_CONSOLE_URL } from './content';

export function Cta() {
  const { register } = useAuth();
  return (
    <section
      aria-labelledby="cta-h"
      className="reveal relative mx-auto flex w-full max-w-[1360px] flex-wrap items-center justify-between gap-8 overflow-hidden rounded-[32px] bg-action p-8 text-white sm:p-14"
    >
      <svg aria-hidden width="520" height="520" viewBox="0 0 200 200" className="pointer-events-none absolute -right-[150px] -top-[170px] opacity-20 animate-spin-slow">
        <rect x="45" y="45" width="80" height="80" rx="10" transform="rotate(45 85 85)" fill="none" stroke="#FFFFFF" strokeWidth="3" />
        <rect x="75" y="75" width="80" height="80" rx="10" transform="rotate(45 115 115)" fill="none" stroke="#1FD3E6" strokeWidth="3" />
      </svg>
      <div className="relative flex max-w-2xl flex-col gap-3">
        <h2 id="cta-h" className="m-0 text-[30px] font-extrabold leading-[1.06] tracking-[-0.035em] sm:text-[42px]">
          Open an account in about five minutes.
        </h2>
        <p className="m-0 text-[17px] leading-relaxed text-[#e4ebfa]">
          Sign up, verify your ID, link a bank or mobile money. Your first deposit can be USD-X before lunch.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void register({ returnTo: '/home' })}
        className="nudge relative inline-flex min-h-14 cursor-pointer items-center gap-2.5 rounded-2xl bg-white px-6 text-base font-extrabold text-navy"
      >
        Get started
        <ArrowRight className="size-4" aria-hidden />
      </button>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-[1360px] flex-col gap-7 px-1 pb-7 pt-9">
      <div className="flex flex-wrap justify-between gap-8">
        <Logo size={34} />
        <nav aria-label="Footer" className="flex flex-wrap gap-12 text-sm">
          <div className="flex flex-col gap-2.5">
            <span className="font-extrabold text-navy">Product</span>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-muted no-underline hover:text-navy">
                {l.label}
              </a>
            ))}
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="font-extrabold text-navy">Staff</span>
            <a href={OPS_CONSOLE_URL} className="text-muted no-underline hover:text-navy">
              Ops Console
            </a>
          </div>
        </nav>
      </div>
      <p className="m-0 border-t border-line pt-4 text-[12.5px] leading-relaxed text-subtle">
        USD-X is issued against fiat held on the ledger and burned when redeemed.
      </p>
    </footer>
  );
}
