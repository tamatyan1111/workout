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
        name: 'たまちゃんの筋トレ管理',
        short_name: '筋トレ管理',
        description: '筋トレの記録入力・管理表・進捗グラフのダッシュボード',
        theme_color: '#3b82f6',
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
      // 開始・コールバックURL等)まで横取りしてしまう事故が起きたため、denylist(除外リスト)
      // ではなくallowlist(許可リスト)方式にする。SPA内のクライアントサイドルーティングが
      // 実際に必要なパス(/reset-password)だけを明示的に許可し、それ以外(/api/は当然として、
      // 今後増える未知のパスも含めて)はデフォルトでフォールバック対象にしない安全側に倒す。
      workbox: {
        navigateFallbackAllowlist: [/^\/reset-password/],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
  },
});
