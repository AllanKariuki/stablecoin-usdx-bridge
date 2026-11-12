import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    // @damp/web-shared is linked from the workspace and has its own
    // node_modules; without this, two copies of React end up in the bundle
    // and hooks inside shared components break.
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  server: {
    // 5174 is load-bearing: it is the damp-ops client's redirect URI in
    // infra/keycloak/templates/damp-realm.template.json and an allowed CORS
    // origin in infra/traefik/dynamic.yaml. The portal owns 5173.
    port: 5174,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
