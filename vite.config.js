import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Página pública para que un contacto rellene sus datos (ficha.html). En Vercel la ruta
// /ficha/<token> la sirve vercel.json; aquí, lo mismo para `npm run dev` y `npm run preview`.
const FICHA_ROUTE = /^\/ficha\/[^/?#]+\/?(\?.*)?$/
function fichaRoute() {
  const rewrite = (req, _res, next) => {
    if (FICHA_ROUTE.test(req.url || '')) req.url = '/ficha.html'
    next()
  }
  return {
    name: 'cesi-ficha-route',
    enforce: 'post',
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    },
    // Quien abre el enlace no usa la app: sin manifest ni service worker (no se le instala nada).
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.filename.endsWith('ficha.html')) return html
        return html
          .replace(/<link rel="manifest"[^>]*>/g, '')
          .replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/g, '')
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    rolldownOptions: {
      input: { main: 'index.html', ficha: 'ficha.html' },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // Notificaciones de los recordatorios (public/push-sw.js).
      // La fuente de las banderas (woff2) también se guarda para usar la app sin conexión.
      // /ficha/<token> es la página pública (ficha.html), no la app: el service worker no la sustituye.
      workbox: {
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallbackDenylist: [/^\/ficha\//],
      },
      manifest: {
        name: 'CESI',
        short_name: 'CESI',
        description: 'Gestión de reuniones y disponibilidad de CESI',
        theme_color: '#2563eb',
        background_color: '#f7f8fa',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'es',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
    fichaRoute(),
  ],
  test: {
    environment: 'node',
    globalSetup: ['./test/globalSetup.js'],
    setupFiles: ['./test/setup.js'],
    include: ['src/**/*.test.js'],
  },
})
