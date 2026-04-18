import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['StrikeIntelLogo.png'],
      manifest: {
        name: 'Strike Intel',
        short_name: 'Strike Intel',
        description: 'Pattern-based freshwater fishing intelligence for Lake Texoma',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#060d17',
        background_color: '#060d17',
        icons: [
          { src: '/StrikeIntelLogo.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/StrikeIntelLogo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/StrikeIntelLogo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.maptiler\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/archive-api\.open-meteo\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'weather-api',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
