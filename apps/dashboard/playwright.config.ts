import { defineConfig, devices } from '@playwright/test';

// design.md §5「セットアップ手順」のdev/router.php(本番相当の同一オリジン構成)に対して実行する。
// CIでは事前にビルド済みdistをphp -Sで配信してから起動する(README「E2Eテスト」参照)。
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:8000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
