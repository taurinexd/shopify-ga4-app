import { chromium } from "@playwright/test";
import fs from "node:fs";

const STORE_URL = "https://ga4-challenge-dev.myshopify.com";
const STOREFRONT_PASSWORD = "thauly";
const RELAY_BODY_DUMP = "/tmp/relay-bodies.jsonl";
fs.writeFileSync(RELAY_BODY_DUMP, "");

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ["--auto-open-devtools-for-tabs"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();

  page.on("console", (msg) => {
    const t = msg.type();
    if (t === "error" || t === "warning") {
      console.log(`[console.${t}] ${msg.text()}`);
    }
  });

  page.on("pageerror", (err) => {
    console.log(`[pageerror] ${err.message}`);
  });

  page.on("requestfailed", (req) => {
    const u = req.url();
    if (u.includes("collect") || u.includes("apps/") || u.includes("ga4")) {
      console.log(`[FAIL] ${req.method()} ${u} :: ${req.failure()?.errorText ?? "?"}`);
    }
  });

  // Listen for ALL frames (including pixel iframes) and workers.
  ctx.on("request", (req) => {
    const u = req.url();
    const isVercel = u.includes("vercel.app");
    const isGA4 = u.includes("google-analytics.com/g/collect") || u.includes("google-analytics.com/mp/collect");
    const isGTM = u.includes("googletagmanager.com/gtag") || u.includes("googletagmanager.com/gtm");
    if (isVercel || isGA4 || isGTM) {
      console.log(`[REQ ] ${req.method()} ${u.slice(0, 200)}`);
      const post = req.postData();
      if (post) {
        const isOurRelay = u.includes('shopify-ga4-relay.vercel.app/api/collect');
        if (isOurRelay) {
          fs.appendFileSync(RELAY_BODY_DUMP, post + "\n");
          console.log(`       body: (dumped to ${RELAY_BODY_DUMP}, ${post.length} bytes)`);
        } else {
          console.log(`       body: ${post.slice(0, 300)}`);
        }
      }
    }
  });

  ctx.on("response", (res) => {
    const u = res.url();
    const isVercel = u.includes("vercel.app");
    const isGA4 = u.includes("google-analytics.com/g/collect") || u.includes("google-analytics.com/mp/collect");
    if (isVercel || isGA4) {
      console.log(`[RESP] ${res.status()} ${u.slice(0, 200)}`);
    }
  });

  ctx.on("requestfailed", (req) => {
    const u = req.url();
    if (u.includes("vercel.app") || u.includes("/api/collect") || u.includes("/apps/ga4-relay")) {
      console.log(`[FAIL] ${req.method()} ${u} :: ${req.failure()?.errorText ?? "?"}`);
    }
  });

  console.log(`[boot] navigating to ${STORE_URL}/?ga4_debug=1`);
  await page.goto(`${STORE_URL}/password`);
  // try password unlock
  try {
    await page.fill('input[name="password"]', STOREFRONT_PASSWORD, { timeout: 5000 });
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(?!password)/, { timeout: 10000 });
  } catch {
    console.log("[boot] no password gate (or already unlocked)");
  }
  await page.goto(`${STORE_URL}/?ga4_debug=1`);

  console.log("[ready] storefront open. Interact freely; this process stays alive.");
  // keep alive
  await new Promise(() => {});
})();
