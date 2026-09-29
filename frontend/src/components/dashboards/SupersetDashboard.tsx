import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import supersetService from '../../services/supersetService';

interface SupersetDashboardProps {
  dashboardId: string;
  title?: string;
  height?: string;
  className?: string;
  showFilters?: boolean;
}

interface SupersetEmbedSDK {
  embedDashboard: (config: {
    id: string;
    supersetDomain: string;
    mountPoint: HTMLElement;
    fetchGuestToken: () => Promise<string>;
    dashboardUiConfig?: {
      hideTitle?: boolean;
      hideChartControls?: boolean;
      filters?: { visible: boolean; expanded: boolean };
    };
  }) => Promise<void>;
}

declare global {
  interface Window {
    supersetEmbeddedSdk?: SupersetEmbedSDK;
  }
}

/**
 * An embedded Superset dashboard.
 *
 * The token comes from `services/reporting`, which mints it with the admin
 * credential it holds and scopes it with row-level security derived from the
 * caller's resolved permissions. This component used to `POST
 * /api/superset/guest-token` — a route nothing has ever served — and fall
 * back to a `guestToken` prop, so it had two paths and neither worked.
 *
 * The Superset domain comes back *with* the token rather than from frontend
 * config: the server knows where its own Superset is, and a second copy in a
 * JS bundle is a second thing to get wrong per environment.
 */
const SupersetDashboard: React.FC<SupersetDashboardProps> = ({
  dashboardId,
  title = 'Dashboard',
  height = '600px',
  className = '',
  showFilters = true,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetched fresh on every call, not cached. The SDK invokes this again when
  // a token expires, and a cached one would turn a tab left open overnight
  // into a blank dashboard in the morning.
  const fetchGuestToken = useCallback(async () => {
    const { token } = await supersetService.guestToken(dashboardId);
    return token;
  }, [dashboardId]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        // The first call does double duty: it proves the caller may see this
        // dashboard at all, and it tells us where Superset is. Discovering a
        // permission problem here rather than inside the SDK is the
        // difference between a readable message and an empty iframe.
        const { supersetUrl } = await supersetService.guestToken(dashboardId);
        if (cancelled) return;

        await loadSdk(supersetUrl);
        if (cancelled || !mountRef.current || !window.supersetEmbeddedSdk) return;

        mountRef.current.innerHTML = '';
        await window.supersetEmbeddedSdk.embedDashboard({
          id: dashboardId,
          supersetDomain: supersetUrl,
          mountPoint: mountRef.current,
          fetchGuestToken,
          dashboardUiConfig: {
            hideTitle: true,
            hideChartControls: false,
            filters: { visible: showFilters, expanded: false },
          },
        });
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(messageOf(err));
        setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [dashboardId, fetchGuestToken, showFilters]);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>

      {loading && (
        <div className="flex items-center justify-center" style={{ height }}>
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <p className="text-gray-600 mt-2 text-sm">Loading dashboard…</p>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center justify-center p-8" style={{ height }}>
          <div className="text-center max-w-md">
            <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
            <p className="text-gray-800 font-medium">This dashboard isn’t available</p>
            <p className="text-gray-600 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      <div ref={mountRef} style={{ height, display: loading || error ? 'none' : 'block' }} />
    </div>
  );
};

/**
 * Loads Superset's embed SDK from the Superset the server named.
 *
 * Resolved immediately if it is already on the page: the SDK is a global, and
 * a second `<script>` for it would re-register the same object on every
 * dashboard a page renders.
 */
function loadSdk(supersetUrl: string): Promise<void> {
  if (window.supersetEmbeddedSdk) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${supersetUrl.replace(/\/$/, '')}/static/assets/embedded.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the Superset embed SDK'));
    document.head.appendChild(script);
  });
}

function messageOf(err: unknown): string {
  const response = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (response) return response;
  return err instanceof Error ? err.message : 'Unknown error';
}

export default SupersetDashboard;
