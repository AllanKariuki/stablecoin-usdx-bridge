import { Briefcase, User } from 'lucide-react';
import { useAuth } from '@damp/web-shared/auth';
import { AppShell } from '@damp/web-shared/layout';
import { NotificationBell } from '@damp/web-shared/notifications';
import { PORTAL_NAV } from '../nav';

/** Which account the user is acting as. Business users see their org reference. */
function AccountContext() {
  const { user, hasRole } = useAuth();
  const business = hasRole('company');
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-white/12 bg-white/6 px-3 py-2.5">
      <span className="grid size-8 place-items-center rounded-[10px] bg-cyan/20 text-cyan">
        {business ? <Briefcase className="size-4" aria-hidden /> : <User className="size-4" aria-hidden />}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-on-navy-subtle">{business ? 'Business account' : 'Personal account'}</p>
        <p className="truncate font-mono text-xs text-white">{business ? (user?.orgId ?? 'No organisation') : (user?.email ?? '')}</p>
      </div>
    </div>
  );
}

export default function PortalLayout() {
  const { can } = useAuth();
  return (
    <AppShell
      appName="Self-Service"
      nav={PORTAL_NAV}
      context={<AccountContext />}
      settingsTo="/settings"
      topbar={<p className="text-sm text-muted">Money you hold, on a ledger you can check.</p>}
      actions={can('notifications:read:own') ? <NotificationBell /> : undefined}
    />
  );
}
