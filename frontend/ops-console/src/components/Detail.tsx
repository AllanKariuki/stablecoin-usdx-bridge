import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/** Back link above a detail page header. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-action no-underline hover:underline">
      <ChevronLeft className="size-4" aria-hidden />
      {children}
    </Link>
  );
}

/** Two-column detail layout that stacks below lg. */
export function DetailGrid({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-5">{main}</div>
      <div className="flex min-w-0 flex-col gap-5">{side}</div>
    </div>
  );
}
