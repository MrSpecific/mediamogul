import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { cloudflare } from '@cloudflare/vite-plugin'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    // Installable PWA: generates the web manifest + a Workbox service worker that
    // precaches the app shell and auto-updates. API/auth/media requests are left
    // to the network (never cached), and navigations fall back to the SPA shell.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MediaMogul',
        short_name: 'MediaMogul',
        description:
          'Track the movies, TV, books, audiobooks, and magazines you consume — with ratings, reviews, and lists.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#E0871B',
        background_color: '#0c0a06',
        categories: ['entertainment', 'books', 'lifestyle'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        // Server-rendered / API / media routes must hit the network, not the
        // cached SPA shell.
        navigateFallbackDenylist: [/^\/api\//, /^\/m\//, /^\/uploads\//],
        cleanupOutdatedCaches: true,
      },
      // No service worker in dev — avoids stale caches while iterating.
      devOptions: { enabled: false },
    }),
    // Runs the Worker (worker/index.ts) inside Vite's dev server and wires the
    // React build to Cloudflare static assets for `wrangler deploy`.
    // `remoteBindings` lets bindings flagged `remote: true` (the R2 media bucket)
    // hit real Cloudflare resources in dev — see wrangler.jsonc.
    cloudflare({ remoteBindings: true }),
  ],
})
