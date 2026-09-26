import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      // Notificaciones de los recordatorios (public/push-sw.js).
      // La fuente de las banderas (woff2) también se guarda para usar la app sin conexión.
      workbox: { importScripts: ['push-sw.js'], globPatterns: ['**/*.{js,css,html,woff2}'] },
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
  ],
  test: {
    environment: 'node',
    globalSetup: ['./test/globalSetup.js'],
    setupFiles: ['./test/setup.js'],
    include: ['src/**/*.test.js'],
  },
})
