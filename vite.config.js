import { defineConfig } from 'vite'
import pkg from './package.json'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Vercel이 빌드 시 자동으로 심어주는 VERCEL_ENV("production"/"preview"/"development") 기준으로
// 개발 브랜치 프리뷰 배포를 구분한다. 로컬 빌드(npm run dev/build)는 이 값이 없어 "local"로
// 취급되고, production이 아닌 모든 경우를 "개발용 앱"으로 간주한다(잘못 표시될 바엔 과하게 표시하는 쪽이 안전).
const DEPLOY_ENV = process.env.VERCEL_ENV || 'local'
const IS_DEV_BUILD = DEPLOY_ENV !== 'production'
const APP_TITLE = IS_DEV_BUILD ? '베이비큐브 (개발)' : '베이비큐브'
const THEME_COLOR = IS_DEV_BUILD ? '#E07A3F' : '#6B8F71'
const ICON_SVG = IS_DEV_BUILD ? '/pwa-icon-dev.svg' : '/pwa-icon.svg'
const ICON_192 = IS_DEV_BUILD ? '/pwa-192-dev.png' : '/pwa-192.png'
const ICON_512 = IS_DEV_BUILD ? '/pwa-512-dev.png' : '/pwa-512.png'
const ICON_512_MASKABLE = IS_DEV_BUILD ? '/pwa-512-maskable-dev.png' : '/pwa-512-maskable.png'
const APPLE_ICON = IS_DEV_BUILD ? '/apple-touch-icon-dev.png' : '/apple-touch-icon.png'

// index.html은 vite-plugin-pwa 매니페스트가 건드리지 못하는 부분(<title>, apple-touch-icon 등
// 정적 메타 태그)을 담고 있어서, 빌드 환경에 맞게 직접 치환하는 작은 플러그인을 둔다.
function devIdentityHtmlPlugin() {
  return {
    name: 'dev-identity-html',
    transformIndexHtml(html) {
      return html
        .replace('<meta name="theme-color" content="#6B8F71" />', `<meta name="theme-color" content="${THEME_COLOR}" />`)
        .replace('<link rel="icon" type="image/svg+xml" href="/pwa-icon.svg" />', `<link rel="icon" type="image/svg+xml" href="${ICON_SVG}" />`)
        .replace('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />', `<link rel="apple-touch-icon" href="${APPLE_ICON}" />`)
        .replace('<meta name="apple-mobile-web-app-title" content="베이비큐브" />', `<meta name="apple-mobile-web-app-title" content="${APP_TITLE}" />`)
        .replace('<title>베이비큐브</title>', `<title>${APP_TITLE}</title>`)
    },
  }
}

export default defineConfig({
  // 앱 버전 단일 소스: package.json version → 더보기 화면 표기에 사용
  // __DEPLOY_ENV__: 화면 한쪽에 작게 "개발용 배포" 표시를 띄우는 데 사용 (Shell.jsx)
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __DEPLOY_ENV__: JSON.stringify(DEPLOY_ENV) },
  plugins: [
    react(),
    tailwindcss(),
    devIdentityHtmlPlugin(),
    VitePWA({
      // 'prompt': 새 버전을 즉시/자동으로 적용하지 않고 useRegisterSW(needRefresh)로 감지해
      // 앱 안에서 "새 버전이 있어요" 배너를 직접 띄운 뒤 사용자가 탭하면 적용(App.jsx의 PwaUpdateProvider)
      registerType: 'prompt',
      // 등록 스크립트를 자동 주입하지 않음 - useRegisterSW 훅으로 직접 등록/제어하므로 중복 등록 방지
      injectRegister: null,
      includeAssets: [ICON_SVG.slice(1), APPLE_ICON.slice(1)],
      manifest: {
        name: APP_TITLE,
        short_name: APP_TITLE,
        description: '이유식 재고 · 식단 · 급여 기록 관리',
        lang: 'ko',
        theme_color: THEME_COLOR,
        background_color: '#FAF7F1',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: ICON_192, sizes: '192x192', type: 'image/png' },
          { src: ICON_512, sizes: '512x512', type: 'image/png' },
          { src: ICON_512_MASKABLE, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
