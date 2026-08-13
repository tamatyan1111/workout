/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// FTPで1ファイルだけアップロードすれば済むよう、JS/CSSを単一HTMLにバンドルする(design.md §5 手順7)
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
  },
});
