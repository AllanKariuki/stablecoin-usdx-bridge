import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 5173 is load-bearing, not just Vite's default: it's baked into
    // Keycloak's damp-portal client redirectUris
    // (infra/keycloak/templates/damp-realm.template.json) and
    // public/runtime-config.js's VITE_REDIRECT_URI. A dev server on any
    // other port sends the PKCE callback to an origin nothing is listening
    // on — see docs/building-plan.md's port map.
    port: 5173
  }
})
