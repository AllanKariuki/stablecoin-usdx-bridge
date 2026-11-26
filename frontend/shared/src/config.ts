/**
 * Runtime configuration. Each app ships a public/runtime-config.js that sets
 * window.RUNTIME_CONFIG, so one built bundle can be pointed at a different
 * Keycloak/gateway by swapping that file at deploy time; VITE_* build-time
 * env is the fallback for tests and ad-hoc builds.
 */
export interface AppConfig {
  VITE_API_BASE_URL: string;
  VITE_KEYCLOAK_AUTHORITY: string;
  VITE_KEYCLOAK_CLIENT_ID: string;
  VITE_REDIRECT_URI: string;
  VITE_KEYCLOAK_POSTLOGOUT_URI: string;
  VITE_APP_WEBSOCKET_URL: string;
}

declare global {
  interface Window {
    RUNTIME_CONFIG?: Partial<AppConfig>;
  }
}

const DEFAULTS: AppConfig = {
  VITE_API_BASE_URL: 'http://localhost:18082/api',
  VITE_KEYCLOAK_AUTHORITY: 'http://localhost:8080/realms/damp',
  VITE_KEYCLOAK_CLIENT_ID: 'damp-portal',
  VITE_REDIRECT_URI: 'http://localhost:5173/auth/callback',
  VITE_KEYCLOAK_POSTLOGOUT_URI: 'http://localhost:5173',
  VITE_APP_WEBSOCKET_URL: 'ws://localhost:13000/ws',
};

export function getConfig(): AppConfig {
  const runtime = (typeof window !== 'undefined' && window.RUNTIME_CONFIG) || {};
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const pick = (key: keyof AppConfig) => runtime[key] || env[key] || DEFAULTS[key];
  return {
    VITE_API_BASE_URL: pick('VITE_API_BASE_URL'),
    VITE_KEYCLOAK_AUTHORITY: pick('VITE_KEYCLOAK_AUTHORITY'),
    VITE_KEYCLOAK_CLIENT_ID: pick('VITE_KEYCLOAK_CLIENT_ID'),
    VITE_REDIRECT_URI: pick('VITE_REDIRECT_URI'),
    VITE_KEYCLOAK_POSTLOGOUT_URI: pick('VITE_KEYCLOAK_POSTLOGOUT_URI'),
    VITE_APP_WEBSOCKET_URL: pick('VITE_APP_WEBSOCKET_URL'),
  };
}
