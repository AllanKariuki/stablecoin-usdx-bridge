// Superset Dashboard Configuration with Environment-based Flexibility
export const SUPERSET_CONFIG = {
  // Superset instance configuration - supports multiple environments
  SUPERSET_URL: import.meta.env.VITE_SUPERSET_URL || 'http://localhost:8088',
  
  // Alternative configuration for different environments
  ENVIRONMENTS: {
    development: {
      url: import.meta.env.VITE_SUPERSET_DEV_URL || 'http://localhost:8088',
      apiPath: '/api/v1',
      guestTokenPath: '/api/v1/security/guest_token/',
    },
    staging: {
      url: import.meta.env.VITE_SUPERSET_STAGING_URL || 'https://staging-superset.your-domain.com',
      apiPath: '/api/v1',
      guestTokenPath: '/api/v1/security/guest_token/',
    },
    production: {
      url: import.meta.env.VITE_SUPERSET_PROD_URL || 'https://superset.your-domain.com',
      apiPath: '/api/v1',
      guestTokenPath: '/api/v1/security/guest_token/',
    }
  },
  
  // Dashboard IDs for different report types - environment aware
  DASHBOARDS: {
    CREW_REPORTS: import.meta.env.VITE_CREW_DASHBOARD_ID || 'crew-reports-dashboard',
    FLIGHT_REPORTS: import.meta.env.VITE_FLIGHT_DASHBOARD_ID || 'flight-reports-dashboard',
    MAINTENANCE_REPORTS: import.meta.env.VITE_MAINTENANCE_DASHBOARD_ID || 'maintenance-reports-dashboard',
    SAFETY_COMPLIANCE: import.meta.env.VITE_SAFETY_DASHBOARD_ID || 'safety-compliance-dashboard',
  },

  // Dashboard URLs for direct linking (optional - for external links)
  DASHBOARD_URLS: {
    CREW_REPORTS: import.meta.env.VITE_CREW_DASHBOARD_URL,
    FLIGHT_REPORTS: import.meta.env.VITE_FLIGHT_DASHBOARD_URL,
    MAINTENANCE_REPORTS: import.meta.env.VITE_MAINTENANCE_DASHBOARD_URL,
    SAFETY_COMPLIANCE: import.meta.env.VITE_SAFETY_DASHBOARD_URL,
  },

  // Default dashboard configuration
  DEFAULT_CONFIG: {
    height: '800px',
    width: '100%',
    refreshInterval: 300000, // 5 minutes in milliseconds
    allowFullscreen: true,
    showFilters: true,
    showTitle: true,
  },

  // Authentication configuration
  AUTH_CONFIG: {
    useGuestToken: import.meta.env.VITE_SUPERSET_USE_GUEST_TOKEN === 'true',
    staticGuestToken: import.meta.env.VITE_SUPERSET_STATIC_GUEST_TOKEN,
    tokenRefreshInterval: 240000, // 4 minutes (tokens expire in 5 minutes)
  }
};

// Get current environment configuration
export const getCurrentSupersetConfig = () => {
  const env = import.meta.env.MODE || 'development';
  const envConfig = SUPERSET_CONFIG.ENVIRONMENTS[env as keyof typeof SUPERSET_CONFIG.ENVIRONMENTS];
  
  return {
    ...envConfig,
    url: SUPERSET_CONFIG.SUPERSET_URL || envConfig.url,
  };
};

// Utility function to build dashboard URL
export const buildDashboardUrl = (dashboardId: string, embedded: boolean = true) => {
  const config = getCurrentSupersetConfig();
  const baseUrl = config.url;
  
  if (embedded) {
    return `${baseUrl}/superset/dashboard/${dashboardId}/?standalone=3`;
  }
  
  return `${baseUrl}/superset/dashboard/${dashboardId}/`;
};

// Utility function to get external dashboard link
export const getExternalDashboardLink = (dashboardType: keyof typeof SUPERSET_CONFIG.DASHBOARDS) => {
  const directUrl = SUPERSET_CONFIG.DASHBOARD_URLS[dashboardType];
  if (directUrl) return directUrl;
  
  const dashboardId = SUPERSET_CONFIG.DASHBOARDS[dashboardType];
  return buildDashboardUrl(dashboardId, false);
};

// Dashboard metadata for each report type
export const DASHBOARD_METADATA = {
  CREW_REPORTS: {
    title: 'Crew Reports Dashboard',
    description: 'Comprehensive view of crew scheduling, performance, and compliance metrics',
    filters: ['date_range', 'crew_id', 'base_location']
  },
  FLIGHT_REPORTS: {
    title: 'Flight Operations Dashboard',
    description: 'Real-time and historical flight data, performance metrics, and operational insights',
    filters: ['date_range', 'flight_number', 'route', 'aircraft_type']
  },
  MAINTENANCE_REPORTS: {
    title: 'Maintenance Analytics Dashboard',
    description: 'Aircraft maintenance schedules, compliance tracking, and predictive analytics',
    filters: ['date_range', 'aircraft_id', 'maintenance_type', 'status']
  },
  SAFETY_COMPLIANCE: {
    title: 'Safety & Compliance Dashboard',
    description: 'Safety metrics, incident tracking, regulatory compliance, and audit reports',
    filters: ['date_range', 'incident_type', 'severity', 'status']
  }
};

export type DashboardType = keyof typeof SUPERSET_CONFIG.DASHBOARDS;
