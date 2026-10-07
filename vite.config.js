import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Páginas públicas, aparte de la app: /ficha/<token> (un contacto rellena sus datos, ficha.html)
// y /confirmar/<token> (confirmar.html: solo un aviso "Este enlace ya no está activo", porque la
// confirmación de asistencia se quitó y aún puede haber enlaces enviados). En Vercel las
// rutas las sirve vercel.json; aquí, lo mismo para `npm run dev` y `npm run preview`.
const PUBLIC_PAGES = [
  { route: /^\/ficha\/[^/?#]+\/?(\?.*)?$/, file: 'ficha.html' },
  { route: /^\/confirmar\/[^/?#]+\/?(\?.*)?$/, file: 'confirmar.html' },
]
function publicPages() {
  const rewrite = (req, _res, next) => {
    const page = PUBLIC_PAGES.find((p) => p.route.test(req.url || ''))
    if (page) req.url = `/${page.file}`
    next()
  }
  return {
    name: 'cesi-public-pages',
    enforce: 'post',
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    },
    // Quien abre el enlace no usa la app: sin manifest (y sus main.jsx no registran el service worker).
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!PUBLIC_PAGES.some((p) => ctx.filename.endsWith(p.file))) return html
        return html
          .replace(/<link rel="manifest"[^>]*>/g, '')
          .replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/g, '')
      },
    },
  }
}

// Versión de cada build (el commit en Vercel). La app la lleva dentro (__APP_VERSION__) y se
// publica en /version.json: si no coinciden, hay una versión nueva (ver src/lib/appUpdates.js).
const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`
function appVersion() {
  return {
    name: 'cesi-app-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  build: {
    rolldownOptions: {
      input: { main: 'index.html', ficha: 'ficha.html', confirmar: 'confirmar.html' },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Se registra desde src/lib/appUpdates.js, que además recarga la página con la versión nueva.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // La fuente de las banderas (woff2) también se guarda para usar la app sin conexión.
      // /ficha/<token> y /confirmar/<token> son páginas públicas, no la app: el service worker no las sustituye.
      workbox: {
        // Con injectRegister: false el plugin ya no los activa solo: la versión nueva toma el control al instalarse.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallbackDenylist: [/^\/ficha\//, /^\/confirmar\//],
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
    publicPages(),
    appVersion(),
  ],
  test: {
    environment: 'node',
    globalSetup: ['./test/globalSetup.js'],
    setupFiles: ['./test/setup.js'],
    include: ['src/**/*.test.js'],
  },
})
