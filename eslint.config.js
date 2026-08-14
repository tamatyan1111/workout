import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/vendor/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2023,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.test.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Playwright設定・E2Eテストはブラウザではなくplaywrightのテストランナー(Node.js)上で動く
    files: ['**/playwright.config.ts', '**/e2e/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // sql/import/配下は文科省データ取り込み用のNode.js CLIスクリプト(ブラウザ向けコードではない)
    files: ['sql/import/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  prettierConfig
);
