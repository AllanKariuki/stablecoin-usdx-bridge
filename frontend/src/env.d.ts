/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Superset Configuration
  readonly VITE_SUPERSET_URL: string
  readonly VITE_SUPERSET_DEV_URL: string
  readonly VITE_SUPERSET_STAGING_URL: string
  readonly VITE_SUPERSET_PROD_URL: string
  
  // Dashboard IDs
  readonly VITE_CREW_DASHBOARD_ID: string
  readonly VITE_FLIGHT_DASHBOARD_ID: string
  readonly VITE_MAINTENANCE_DASHBOARD_ID: string
  readonly VITE_SAFETY_DASHBOARD_ID: string
  
  // Dashboard URLs (optional)
  readonly VITE_CREW_DASHBOARD_URL: string
  readonly VITE_FLIGHT_DASHBOARD_URL: string
  readonly VITE_MAINTENANCE_DASHBOARD_URL: string
  readonly VITE_SAFETY_DASHBOARD_URL: string
  
  // Authentication
  readonly VITE_SUPERSET_USE_GUEST_TOKEN: string
  readonly VITE_SUPERSET_STATIC_GUEST_TOKEN: string
  
  // API Configuration
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
