/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// PWA化(Service Worker)には単一HTMLへのバンドル(vite-plugin-singlefile)は使えない
// (Service Workerは独立したファイルとして配信する必要があるため)。
// public-siteと同じく複数ファイル構成でFTPアップロードする(design.md §5 手順7)。
// デプロイ先は秘密パス配下のサブディレクトリ(design.md §1)で、そのパス名は
// リポジトリに含めない方針のため、base は相対パスにしてどの階層でも動くようにする
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico'],
      manifest: {
        name: 'たまちゃんの筋トレ管理(入力)',
        short_name: '筋トレ入力',
        description: '筋トレの記録入力・管理表編集ページ(記録者専用)',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
  },
});
