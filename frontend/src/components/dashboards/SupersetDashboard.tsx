import React, { useEffect, useRef, useState } from 'react';
import { getCurrentSupersetConfig, buildDashboardUrl } from '../../config/supersetConfig';

interface SupersetDashboardProps {
  dashboardId: string;
  supersetUrl?: string;
  title?: string;
  height?: string;
  width?: string;
  guestToken?: string;
  className?: string;
  allowFullscreen?: boolean;
  showFilters?: boolean;
  externalLinkUrl?: string;
}

interface SupersetEmbedSDK {
  embedDashboard: (config: {
    id: string;
    supersetDomain: string;
    mountPoint: HTMLElement;
    fetchGuestToken: () => Promise<string>;
    dashboardUiConfig?: {
      hideTitle?: boolean;
      hideTab?: boolean;
      hideChartControls?: boolean;
      filters?: {
        visible: boolean;
        expanded: boolean;
      };
    };
  }) => Promise<void>;
}

declare global {
  interface Window {
    supersetEmbeddedSdk: SupersetEmbedSDK;
  }
}

const SupersetDashboard: React.FC<SupersetDashboardProps> = ({
  dashboardId,
  supersetUrl,
  title = 'Dashboard',
  height = '600px',
  width = '100%',
  guestToken,
  className = '',
  allowFullscreen = true,
  showFilters = true,
  externalLinkUrl
}) => {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // Get Superset configuration - use prop or config
  const config = getCurrentSupersetConfig();
  const effectiveSupersetUrl = supersetUrl || config.url;
  const effectiveExternalUrl = externalLinkUrl || buildDashboardUrl(dashboardId, false);

  // Load Superset Embedded SDK
  useEffect(() => {
    const loadSupersetSDK = () => {
      return new Promise<void>((resolve, reject) => {
        // Check if SDK is already loaded
        if (window.supersetEmbeddedSdk) {
          setSdkLoaded(true);
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = `${effectiveSupersetUrl}/static/assets/embedded.js`;
        script.async = true;
        script.onload = () => {
          setSdkLoaded(true);
          resolve();
        };
        script.onerror = () => {
          reject(new Error('Failed to load Superset SDK'));
        };
        document.head.appendChild(script);
      });
    };

    loadSupersetSDK().catch(() => {
      setError('Failed to load Superset SDK');
      setIsLoading(false);
    });
  }, [effectiveSupersetUrl]);

  // Embed dashboard when SDK is loaded
  useEffect(() => {
    const embedDashboard = async () => {
      if (!sdkLoaded || !dashboardRef.current || !window.supersetEmbeddedSdk) {
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Clear any existing content
        dashboardRef.current.innerHTML = '';

        await window.supersetEmbeddedSdk.embedDashboard({
          id: dashboardId,
          supersetDomain: effectiveSupersetUrl,
          mountPoint: dashboardRef.current,
          fetchGuestToken: async () => {
            if (guestToken) {
              return guestToken;
            }
            
            // If no guest token provided, try to fetch from your API
            try {
              const response = await fetch('/api/superset/guest-token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  dashboardId,
                  user: {
                    username: 'guest',
                    first_name: 'Guest',
                    last_name: 'User'
                  },
                  resources: [{
                    type: 'dashboard',
                    id: dashboardId
                  }]
                })
              });
              
              if (!response.ok) {
                throw new Error('Failed to fetch guest token');
              }
              
              const data = await response.json();
              return data.token;
            } catch (err) {
              console.error('Error fetching guest token:', err);
              throw err;
            }
          },
          dashboardUiConfig: {
            hideTitle: !title,
            hideTab: true,
            hideChartControls: false,
            filters: {
              visible: showFilters,
              expanded: false
            }
          }
        });

        setIsLoading(false);
      } catch (err) {
        console.error('Error embedding dashboard:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        setIsLoading(false);
      }
    };

    embedDashboard();
  }, [sdkLoaded, dashboardId, effectiveSupersetUrl, guestToken, title, showFilters]);

  const handleOpenExternal = () => {
    window.open(effectiveExternalUrl, '_blank', 'noopener,noreferrer');
  };

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-6 ${className}`}>
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Dashboard Error</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button
              onClick={handleOpenExternal}
              className="mt-2 text-sm text-red-800 underline hover:text-red-600"
            >
              Open in new tab
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      {title && (
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <div className="flex items-center gap-2">
            {allowFullscreen && (
              <button
                onClick={handleOpenExternal}
                className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Open in new tab"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                External View
              </button>
            )}
          </div>
        </div>
      )}
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 bg-gray-50 flex items-center justify-center z-10">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="text-gray-600">Loading dashboard...</span>
            </div>
          </div>
        )}
        <div
          ref={dashboardRef}
          style={{ height, width }}
          className="min-h-[400px] w-full"
        />
      </div>
    </div>
  );
};

export default SupersetDashboard;
