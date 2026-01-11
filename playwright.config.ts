import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/ui',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  // Servers must be started manually: npm run dev && npm run dev:web
  // Or set reuseExistingServer: !process.env.CI to auto-start in CI only
});
