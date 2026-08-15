/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// workout.tamachan-blog.com のドキュメントルート直下に配置するため、base はルート(design.md §1・§5)
export default defineConfig({
  base: '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico'],
      manifest: {
        name: 'からだ手帳',
        short_name: 'からだ手帳',
        description: '運動・食事・からだの記録をまとめて管理できるダッシュボード',
        theme_color: '#1f7a6c',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
      // Service WorkerのSPAナビゲーションフォールバック(オフライン時に index.html を返す仕組み)が
      // /api/ 配下への通常のページ遷移(CSVエクスポートのダウンロードリンク、Googleログインの
      // 開始・コールバックURL等)まで横取りしてしまう事故が起きた。このアプリはクエリパラメータ
      // 方式のルーティング(/?reset_token=...)のみを使い、ルート以外の専用パスへの
      // クライアントサイドルーティングを一切必要としないため、フォールバック自体を
      // 完全に無効化する(allowlistを空にすると、どの遷移にもマッチしなくなる)。
      workbox: {
        navigateFallbackAllowlist: [],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    // e2e/配下はPlaywright Test専用(`npm run e2e`)。Vitestの対象に混ざると
    // playwright/test由来のtest()がvitestのtest()と衝突して失敗する
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
});
