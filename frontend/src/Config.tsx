type Config = {
    VITE_API_BASE_URL: string;
    VITE_KEYCLOAK_CLIENT_ID: string;
    VITE_KEYCLOAK_AUTHORITY: string;
    VITE_REDIRECT_URI: string;
    VITE_KEYCLOAK_POSTLOGOUT_URI: string;
    VITE_APP_WEBSOCKET_URL: string;
};

export function getConfig(): Config {
    const runtimeConfig = (window as any).RUNTIME_CONFIG || {};

    return {
        VITE_API_BASE_URL: runtimeConfig.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL  || 'http://localhost:5000/api',
        VITE_APP_WEBSOCKET_URL: runtimeConfig.VITE_APP_WEBSOCKET_URL || import.meta.env.VITE_APP_WEBSOCKET_URL || 'ws://localhost:5000/ws',
        VITE_KEYCLOAK_AUTHORITY: runtimeConfig.VITE_KEYCLOAK_AUTHORITY || import.meta.env.VITE_KEYCLOAK_AUTHORITY || 'http://localhost:8080/auth',
        VITE_KEYCLOAK_CLIENT_ID: runtimeConfig.VITE_KEYCLOAK_CLIENT_ID || import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'aafms',
        VITE_KEYCLOAK_POSTLOGOUT_URI: runtimeConfig.VITE_KEYCLOAK_POSTLOGOUT_URI || import.meta.env.VITE_KEYCLOAK_POSTLOGOUT_URI || 'http://localhost:5173',
        VITE_REDIRECT_URI: runtimeConfig.VITE_REDIRECT_URI || import.meta.env.VITE_REDIRECT_URI || 'http://localhost:5173/callback',
    };
}