import { defineConfig } from 'vite'
import pkg from './package.json'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // 앱 버전 단일 소스: package.json version → 더보기 화면 표기에 사용
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': 새 버전을 즉시/자동으로 적용하지 않고 useRegisterSW(needRefresh)로 감지해
      // 앱 안에서 "새 버전이 있어요" 배너를 직접 띄운 뒤 사용자가 탭하면 적용(App.jsx의 PwaUpdateProvider)
      registerType: 'prompt',
      // 등록 스크립트를 자동 주입하지 않음 - useRegisterSW 훅으로 직접 등록/제어하므로 중복 등록 방지
      injectRegister: null,
      includeAssets: ['pwa-icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '베이비큐브',
        short_name: '베이비큐브',
        description: '이유식 재고 · 식단 · 급여 기록 관리',
        lang: 'ko',
        theme_color: '#6B8F71',
        background_color: '#FAF7F1',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,png}'],
        navigateFallback: '/index.html',
        // Firebase(Firestore·Auth) 요청은 절대 캐시하지 않음 - 실시간 동기화·로그인에 서비스 워커가
        // 관여하면 오프라인 캐시된 옛 데이터가 뜨거나 인증 흐름이 깨질 수 있음 (명시적으로 빈 배열)
        runtimeCaching: [],
      },
    }),
  ],
})
