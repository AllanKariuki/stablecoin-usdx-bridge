// Swapped at deploy time; one bundle serves every environment.
window.RUNTIME_CONFIG = {
  VITE_API_BASE_URL: 'http://localhost:18082/api',
  VITE_KEYCLOAK_CLIENT_ID: 'damp-ops',
  VITE_KEYCLOAK_AUTHORITY: 'http://localhost:8080/realms/damp',
  VITE_REDIRECT_URI: 'http://localhost:5174/auth/callback',
  VITE_KEYCLOAK_POSTLOGOUT_URI: 'http://localhost:5174',
  VITE_APP_WEBSOCKET_URL: 'ws://localhost:13000/ws',
};
