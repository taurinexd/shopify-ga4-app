import { chromium } from "@playwright/test";

const STORE_URL = "https://ga4-challenge-dev.myshopify.com";
const STOREFRONT_PASSWORD = "thauly";

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
    const isInteresting =
      u.includes("vercel.app") ||
      u.includes("/apps/ga4-relay") ||
      (u.includes("/api/collect") && !u.includes("/api/collect.js"));
    if (isInteresting) {
      console.log(`[REQ ] ${req.method()} ${u}`);
      const post = req.postData();
      if (post) console.log(`       body: ${post.slice(0, 400)}`);
    }
  });

  ctx.on("response", (res) => {
    const u = res.url();
    if (u.includes("vercel.app") || u.includes("/api/collect")) {
      console.log(`[RESP] ${res.status()} ${u}`);
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
