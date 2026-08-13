/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// workout.tamachan-blog.com のドキュメントルート直下に配置するため、base はルート
export default defineConfig({
  base: '/',
  test: {
    environment: 'jsdom',
  },
});
