import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const STORAGE_STATE = path.join(process.cwd(), 'tests/e2e/.auth/storefront.json');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 1,
  globalSetup: process.env.STOREFRONT_PASSWORD ? './tests/e2e/global-setup.ts' : undefined,
  use: {
    baseURL: process.env.SHOPIFY_DEV_STORE_URL ?? 'https://example.myshopify.com',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    storageState: process.env.STOREFRONT_PASSWORD ? STORAGE_STATE : undefined,
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});
