import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['app-icon.svg', 'app-icon-192.png', 'app-icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: '마음잇기 - 학생상담관리',
        short_name: '마음잇기',
        description: '교사를 위한 학생 상담 기록 및 후속관리 시스템',
        theme_color: '#2ac1bc',
        background_color: '#f6f7f8',
        display: 'standalone',
        start_url: '/',
        lang: 'ko',
        icons: [
          {
            src: '/app-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/app-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/app-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/app-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        importScripts: ['/push-handler.js'],
        navigateFallback: '/index.html',
        runtimeCaching: [],
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787'
    }
  }
});
