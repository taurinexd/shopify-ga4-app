import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const STORAGE_STATE = path.join(process.cwd(), 'tests/e2e/.auth/storefront.json');

// We always run global-setup. When STOREFRONT_PASSWORD is provided, the
// setup unlocks the storefront and writes a storage state cookie file
// the suite reuses. When the env is missing, the setup script logs a
// clear actionable message ("set STOREFRONT_PASSWORD and SHOPIFY_DEV_STORE_URL")
// and bails — so the failure mode is obvious instead of silent password
// gates causing every assertion to fail with confusing redirect HTML.

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: process.env.SHOPIFY_DEV_STORE_URL ?? 'https://example.myshopify.com',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    storageState: process.env.STOREFRONT_PASSWORD ? STORAGE_STATE : undefined,
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});
