/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// workout.tamachan-blog.com のドキュメントルート直下に配置するため、base はルート
export default defineConfig({
  base: '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico'],
      manifest: {
        name: 'たまちゃんの筋トレ管理',
        short_name: '筋トレ管理',
        description: '筋トレの管理表・進捗グラフを公開するサイト',
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
      // noindex方針(design.md US-9)と同じ理由でsitemap的な露出は不要なため、
      // 開発中(npm run dev)はService Workerを有効にしない
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
  },
});
