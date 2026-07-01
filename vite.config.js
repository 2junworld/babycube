import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-icon.svg'],
      manifest: {
        name: '베이비큐브',
        short_name: '베이비큐브',
        description: '이유식 재고 · 식단 · 급여 기록 관리',
        theme_color: '#6B8F71',
        background_color: '#FAF7F1',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-icon.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/pwa-icon.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: '/pwa-icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico}'],
      },
    }),
  ],
})
