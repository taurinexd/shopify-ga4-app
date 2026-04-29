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
    // Capture everything from the pixel sandbox context, plus our endpoint.
    const isInteresting =
      u.includes("/apps/") ||
      u.includes("ga4-relay") ||
      u.includes("vercel.app") ||
      (u.includes("web-pixel") && req.method() === "POST") ||
      (u.includes("/collect") && !u.includes("monorail") && !u.includes("/api/collect"));
    if (isInteresting) {
      console.log(`[REQ ] ${req.method()} ${u}`);
      const post = req.postData();
      if (post) console.log(`       body: ${post.slice(0, 400)}`);
    }
  });

  ctx.on("response", (res) => {
    const u = res.url();
    if (u.includes("/apps/ga4-relay") || u.includes("ga4-relay") || u.includes("vercel.app")) {
      console.log(`[RESP] ${res.status()} ${u}`);
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

  // Fetch our pixel bundle and inspect it for the latest code markers.
  await page.waitForTimeout(3000);
  const bundleUrls = await page.evaluate(() =>
    Array.from(document.querySelectorAll("iframe")).map((f) => f.src),
  );
  console.log(`[iframes] ${bundleUrls.join(" | ")}`);

  // Also scan all loaded resources for our pixel bundle URL via performance API
  const pixelEntries = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((e) => e.name.includes("web-pixel-") && e.name.includes(".js"))
      .map((e) => e.name),
  );
  console.log(`[pixel-bundles] ${pixelEntries.join(" | ")}`);

  for (const u of pixelEntries) {
    try {
      const result = await page.evaluate(async (url) => {
        const r = await fetch(url);
        return await r.text();
      }, u);
      const text = result;
      const hasBeacon = text.includes("sendBeacon");
      const hasMyShopifyDomain = text.includes("myshopifyDomain");
      const hasRelay = text.includes("apps/ga4-relay");
      const hasAccountID = text.includes("accountID");
      console.log(
        `[bundle ${u.slice(-50)}] sendBeacon=${hasBeacon} myshopifyDomain=${hasMyShopifyDomain} relay=${hasRelay} accountID=${hasAccountID} bytes=${text.length}`,
      );

      // Also try the inner pixel app js (loaded by worker)
      const innerMatch = text.match(/web-pixels\/strict\/app\/web-pixel-[^"' ]+\.js/);
      if (innerMatch) {
        const innerUrl = `https://${new URL(u).host}/web-pixels@${u.match(/web-pixels@([^/]+)/)[1]}/${innerMatch[0]}`;
        try {
          const innerText = await page.evaluate(async (iu) => (await fetch(iu)).text(), innerUrl);
          const r2 = innerText.includes("apps/ga4-relay");
          const m2 = innerText.includes("myshopifyDomain");
          const a2 = innerText.includes("accountID");
          console.log(
            `[inner  ${innerUrl.slice(-60)}] relay=${r2} myshopifyDomain=${m2} accountID=${a2} bytes=${innerText.length}`,
          );
          if (r2 || a2) {
            console.log(`[inner-snippet]\n${innerText.slice(0, 1500)}`);
          }
        } catch (e) {
          console.log(`[inner-fail] ${innerUrl} :: ${e.message}`);
        }
      }
    } catch (e) {
      console.log(`[bundle-fail] ${u} :: ${e.message}`);
    }
  }

  console.log("[ready] storefront open. Interact freely; this process stays alive.");
  // keep alive
  await new Promise(() => {});
})();
