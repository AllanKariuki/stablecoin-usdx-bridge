import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthProvider';
import { ErrorBoundary } from '../pages/ErrorBoundary';

/** Providers every DAMP app needs, outermost first. */
export function AppRoot({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>{children}</AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
