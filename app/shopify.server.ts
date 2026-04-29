import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const _sessionStorage = new PrismaSessionStorage(prisma);

// PrismaSessionStorage's constructor kicks off an async `pollForTable()`
// (a `prisma.session.count()` probe with retries) and stores the
// resulting promise on `.ready`. When the Neon pool is paused or
// saturated the probe rejects, and because nothing awaits `.ready` from
// non-Shopify routes (e.g. the GA4 relay at /api/collect), Node treats
// it as an unhandled rejection and the Vercel function returns
// responseStatusCode: 0 — events from the pixel never reach GA4 MP
// despite the in-flight `keepalive` fetch reporting 204 to the worker.
// Attach a no-op terminal handler so the rejection is "handled". Code
// paths that genuinely need the table (admin auth, webhooks) still
// `await sessionStorage.ready` and will fail loudly there as before.
(_sessionStorage as unknown as { ready: Promise<unknown> }).ready?.catch(
  () => undefined,
);

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: _sessionStorage,
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
