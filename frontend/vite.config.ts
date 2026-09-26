import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // '@' and '@src' both resolve to src/ — pre-existing code
    // (lib/utils/money.ts, components/financial/*, the two P1 orphan test
    // files) already assumed one or the other with no alias configured, so
    // both are wired here rather than picking one and rewriting imports.
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@src': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // 5173 is load-bearing, not just Vite's default: it's baked into
    // Keycloak's damp-portal client redirectUris
    // (infra/keycloak/templates/damp-realm.template.json) and
    // public/runtime-config.js's VITE_REDIRECT_URI. A dev server on any
    // other port sends the PKCE callback to an origin nothing is listening
    // on — see docs/building-plan.md's port map.
    port: 5173
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'dist', 'e2e'],
  },
})
