import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAuth, type Role } from '@damp/web-shared/auth';
import { cx } from '@damp/web-shared/lib';
import { STAFF_ROLES, WORKSPACE_META, type Workspace } from './workspace-config';
import { STORAGE_KEY, WorkspaceContext, readStored, useWorkspace } from './workspace-context';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const available = useMemo(() => STAFF_ROLES.filter((r) => user?.roles.includes(r as Role)), [user]);
  const [chosen, setChosen] = useState<string | null>(readStored);
  const workspace = (available.find((w) => w === chosen) ?? available[0] ?? 'auditor') as Workspace;
  const setWorkspace = useCallback((w: Workspace) => {
    setChosen(w);
    try {
      localStorage.setItem(STORAGE_KEY, w);
    } catch {
      /* a remembered workspace is a convenience; private mode just forgets it */
    }
  }, []);
  const value = useMemo(() => ({ workspace, available, setWorkspace }), [workspace, available, setWorkspace]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/** Sidebar context slot: a switcher when the user holds more than one staff role, a label otherwise. */
export function WorkspaceSwitcher({ onSwitch }: { onSwitch?: () => void }) {
  const { workspace, available, setWorkspace } = useWorkspace();
  const meta = WORKSPACE_META[workspace];
  if (available.length <= 1) {
    return (
      <div className="flex items-center gap-3 rounded-[18px] border border-white/12 bg-white/6 px-3 py-2.5">
        <span className="grid size-9 place-items-center rounded-[12px] bg-cyan/20 text-cyan">
          <meta.icon className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-white">{meta.label} workspace</span>
          <span className="block truncate text-xs text-on-navy-subtle">{meta.blurb}</span>
        </span>
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-label="Workspace" className="grid grid-cols-2 gap-1 rounded-[18px] border border-white/12 bg-white/6 p-1">
      {available.map((w) => {
        const m = WORKSPACE_META[w];
        const on = w === workspace;
        return (
          <button
            key={w}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              setWorkspace(w);
              onSwitch?.();
            }}
            className={cx(
              'flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-[13px] px-2 text-[13px] font-semibold transition-colors',
              on ? 'bg-white text-navy' : 'text-on-navy-muted hover:bg-white/10 hover:text-white',
            )}
          >
            <m.icon className={cx('size-4', on ? 'text-action' : 'text-on-navy-subtle')} aria-hidden />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
