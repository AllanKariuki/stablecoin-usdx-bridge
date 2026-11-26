import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, Settings2, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { ROLE_LABELS, type Permission } from '../auth/authz';
import { cx } from '../lib/cx';
import { IconButton } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { DecorDiamonds } from '../ui/Motion';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown only when the user holds at least one of these. Omit for "everyone in this app". */
  anyOf?: Permission[];
  end?: boolean;
  badge?: ReactNode;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export interface AppShellProps {
  /** Small caps line under the wordmark, e.g. "Self-Service" or "Ops Console". */
  appName: string;
  nav: NavGroup[];
  /** Rendered between the logo and the nav: workspace or org switcher. */
  context?: ReactNode;
  /** Left side of the top bar: search, breadcrumbs. */
  topbar?: ReactNode;
  /** Right side of the top bar, before the user chip: notification bell, connection state. */
  actions?: ReactNode;
  /** Link to the in-app settings page, if the app has one. */
  settingsTo?: string;
  children?: ReactNode;
}

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

function SidebarContents({ appName, nav, context, settingsTo, onNavigate }: AppShellProps & { onNavigate?: () => void }) {
  const { user, can, logout } = useAuth();
  // A nav link that 403s when clicked is a bug (frontend-ui-prd §5): filter
  // by permission, and drop groups left empty.
  const groups = nav
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.anyOf || can(...i.anyOf)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <DecorDiamonds size={420} className="absolute -right-48 -top-40 opacity-[0.12]" />

      <div className="relative px-5 pt-5 pb-4">
        <Logo size={38} subtitle={appName} inverted />
      </div>

      {context && <div className="relative px-3 pb-3">{context}</div>}

      <nav aria-label="Main" className="relative flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group, gi) => (
          <div key={group.label ?? gi} className="mb-4">
            {group.label && <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-on-navy-subtle">{group.label}</p>}
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cx(
                        'group relative flex min-h-11 items-center gap-3 rounded-[14px] px-3 text-sm font-semibold no-underline transition-colors',
                        isActive ? 'bg-white text-navy shadow-card' : 'text-on-navy-muted hover:bg-white/8 hover:text-white',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span aria-hidden className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-cyan animate-grow-y origin-center" />}
                        <item.icon className={cx('size-[18px] shrink-0', isActive ? 'text-action' : 'text-on-navy-subtle group-hover:text-cyan')} aria-hidden />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && item.badge !== null && (
                          <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold', isActive ? 'bg-action-tint text-action-ink' : 'bg-cyan/20 text-cyan')}>{item.badge}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {user && (
        <div className="relative m-3 mt-0 rounded-[20px] border border-white/12 bg-white/6 p-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-cyan/20 text-sm font-extrabold text-cyan" aria-hidden>
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{user.name}</p>
              <p className="truncate text-xs text-on-navy-subtle">{user.roles.map((r) => ROLE_LABELS[r]).join(' · ') || 'No role'}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {settingsTo && (
              <NavLink to={settingsTo} onClick={onNavigate} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-white/8 text-[13px] font-semibold text-on-navy-muted no-underline hover:bg-white/14 hover:text-white">
                <Settings2 className="size-3.5" aria-hidden />
                Settings
              </NavLink>
            )}
            <button type="button" onClick={logout} className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] bg-white/8 text-[13px] font-semibold text-on-navy-muted hover:bg-white/14 hover:text-white">
              <LogOut className="size-3.5" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The authenticated layout shared by every DAMP app: a floating rounded navy
 * sidebar (a drawer below lg), a light top bar, and a centred content
 * column. Nav is filtered by the signed-in user's permissions.
 */
export function AppShell(props: AppShellProps) {
  const { topbar, actions, children } = props;
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawer(false), [location.pathname]);
  // Key the content by the first path segment: sub-route changes (payments
  // tabs, /move/:kind) are new routes for the shell but must not remount and
  // lose page state.
  const section = '/' + (location.pathname.split('/')[1] ?? '');

  return (
    <div className="min-h-dvh bg-shell lg:flex lg:gap-4 lg:p-4">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>

      <aside className="hidden lg:block lg:w-[268px] lg:shrink-0">
        <div className="sticky top-4 h-[calc(100dvh-32px)] rounded-shell bg-navy text-white">
          <SidebarContents {...props} />
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-navy/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-2 left-2 w-[min(300px,calc(100%-56px))] rounded-[28px] bg-navy text-white shadow-pop animate-pop">
            <SidebarContents {...props} onNavigate={() => setDrawer(false)} />
            <IconButton label="Close navigation" onClick={() => setDrawer(false)} className="absolute right-3 top-4 text-on-navy-muted hover:bg-white/10 hover:text-white">
              <X className="size-5" aria-hidden />
            </IconButton>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-line bg-shell/90 px-4 backdrop-blur lg:top-4 lg:rounded-[22px] lg:border lg:bg-surface/85 lg:px-5">
          <IconButton label="Open navigation" onClick={() => setDrawer(true)} className="-ml-2 lg:hidden">
            <Menu className="size-5" aria-hidden />
          </IconButton>
          <span className="lg:hidden">
            <Logo size={30} />
          </span>
          <div className="hidden min-w-0 flex-1 md:block">{topbar}</div>
          <div className="ml-auto flex items-center gap-1.5">{actions}</div>
        </header>

        <main id="main" className="mx-auto w-full max-w-8xl flex-1 px-4 py-6 sm:px-6 lg:px-2 lg:py-8">
          <div key={section} className="animate-rise">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
}
