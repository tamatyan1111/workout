import { defineConfig } from 'vite';

// GitHub Pagesでは https://<user>.github.io/tamachan-kintore/ のサブパスで公開されるため、
// base を明示しないとビルド後のアセットパスが正しく解決されない
export default defineConfig({
  base: '/tamachan-kintore/',
});
