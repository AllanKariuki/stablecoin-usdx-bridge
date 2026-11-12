import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
    // @damp/web-shared is linked from the workspace and imports React itself;
    // one copy, or hooks break across the boundary.
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  server: {
    // Load-bearing: the damp-portal Keycloak client's redirect URI and
    // public/runtime-config.js both name :5173.
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'dist', 'e2e'],
  },
});
