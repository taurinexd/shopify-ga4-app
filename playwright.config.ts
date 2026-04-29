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
  // Shopify dev stores sit behind a Cloudflare/bot-detection layer that
  // ratelimits per source IP within a short window. Running the suite
  // with parallel workers (default = N CPUs) reliably trips the
  // "Your connection needs to be verified before you can proceed"
  // interstitial mid-run, which is impossible to dismiss
  // programmatically. Serializing to a single worker keeps the request
  // rate under the threshold and the storage-state cookie alive.
  workers: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: process.env.SHOPIFY_DEV_STORE_URL ?? 'https://example.myshopify.com',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    storageState: process.env.STOREFRONT_PASSWORD ? STORAGE_STATE : undefined,
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
});
