import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { cloudflare } from '@cloudflare/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    // Runs the Worker (worker/index.ts) inside Vite's dev server and wires the
    // React build to Cloudflare static assets for `wrangler deploy`.
    cloudflare(),
  ],
})
