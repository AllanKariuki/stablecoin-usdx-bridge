import { createContext, useContext } from 'react';
import type { Workspace } from './workspace-config';

interface WorkspaceContextValue {
  workspace: Workspace;
  available: Workspace[];
  setWorkspace: (w: Workspace) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export const STORAGE_KEY = 'damp.ops.workspace';

export const readStored = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}

