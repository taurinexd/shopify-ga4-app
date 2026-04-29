// CDP-based trace: captures console.log from ALL execution contexts
// (page, iframes, web workers including the strict pixel sandbox).
// Also logs every network request matching the relay path.
//
// Usage:
//   node tools/pixel-cdp-trace.mjs
// Then drive the browser manually.

import { chromium } from "@playwright/test";

const STORE_URL = "https://ga4-challenge-dev.myshopify.com";
const STOREFRONT_PASSWORD = "thauly";

function fmtArg(arg) {
  if (!arg) return String(arg);
  if (arg.value !== undefined) return JSON.stringify(arg.value);
  if (arg.unserializableValue) return arg.unserializableValue;
  if (arg.preview?.properties) {
    const obj = {};
    for (const p of arg.preview.properties) obj[p.name] = p.value;
    return JSON.stringify(obj);
  }
  if (arg.description) return arg.description;
  return JSON.stringify(arg);
}

async function attachCDP(client, label) {
  await client.send("Runtime.enable");
  await client.send("Network.enable").catch(() => {});

  client.on("Runtime.consoleAPICalled", (e) => {
    const text = (e.args || []).map(fmtArg).join(" ");
    if (
      text.includes("[GA4]") ||
      text.toLowerCase().includes("error") ||
      text.toLowerCase().includes("cors") ||
      text.toLowerCase().includes("blocked")
    ) {
      console.log(`[${label}.${e.type}] ${text}`);
    }
  });

  client.on("Runtime.exceptionThrown", (e) => {
    const t = e.exceptionDetails?.text || "";
    const ex = e.exceptionDetails?.exception?.description || "";
    console.log(`[${label}.exception] ${t} ${ex}`);
  });
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ["--auto-open-devtools-for-tabs"],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await ctx.newPage();

  // Page console + page errors (for storefront context)
  page.on("console", (msg) => {
    const text = msg.text();
    if (
      text.includes("[GA4]") ||
      msg.type() === "error" ||
      msg.type() === "warning"
    ) {
      console.log(`[page.${msg.type()}] ${text}`);
    }
  });
  page.on("pageerror", (err) => console.log(`[page.error] ${err.message}`));

  // Attach CDP to the main page
  const pageClient = await page.context().newCDPSession(page);
  await attachCDP(pageClient, "main");

  // CRITICAL: attach to workers as they spawn (pixel runs in a worker)
  page.on("worker", async (worker) => {
    console.log(`[worker.spawn] ${worker.url()}`);
    try {
      const wClient = await page.context().newCDPSession(worker);
      await attachCDP(wClient, "worker");
    } catch (e) {
      console.log(`[worker.cdp-fail] ${e.message}`);
    }
    worker.on("console", (msg) => {
      console.log(`[worker.${msg.type()}] ${msg.text()}`);
    });
  });

  // Same for iframes (pixel iframe might host the worker)
  page.on("frameattached", (frame) => {
    if (
      frame.url().includes("webpixel") ||
      frame.url().includes("shopifyapps")
    ) {
      console.log(`[frame.attached] ${frame.url()}`);
    }
  });

  // Network: log everything to relay or /apps/
  ctx.on("request", (req) => {
    const u = req.url();
    if (
      u.includes("/apps/ga4-relay") ||
      u.includes("ga4-relay.vercel.app") ||
      u.includes("/apps/") ||
      (u.includes("/collect") &&
        !u.includes("monorail") &&
        !u.includes("/api/collect"))
    ) {
      console.log(`[REQ ] ${req.method()} ${u}`);
      const post = req.postData();
      if (post) console.log(`       body: ${post.slice(0, 500)}`);
    }
  });

  ctx.on("response", async (res) => {
    const u = res.url();
    if (
      u.includes("/apps/ga4-relay") ||
      u.includes("ga4-relay.vercel.app") ||
      u.includes("vercel.app")
    ) {
      let bodyPreview = "";
      try {
        const buf = await res.body();
        bodyPreview = buf.toString("utf8").slice(0, 200);
      } catch {}
      console.log(`[RESP] ${res.status()} ${u} :: ${bodyPreview}`);
    }
  });

  ctx.on("requestfailed", (req) => {
    const u = req.url();
    if (
      u.includes("/apps/ga4-relay") ||
      u.includes("ga4-relay.vercel.app") ||
      u.includes("/apps/")
    ) {
      console.log(
        `[FAIL] ${req.method()} ${u} :: ${req.failure()?.errorText ?? "?"}`,
      );
    }
  });

  console.log(`[boot] opening ${STORE_URL}/password`);
  await page.goto(`${STORE_URL}/password`);
  try {
    await page.fill('input[name="password"]', STOREFRONT_PASSWORD, {
      timeout: 5000,
    });
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(?!password)/, { timeout: 10000 });
  } catch {
    console.log("[boot] no password gate or already unlocked");
  }

  console.log(`[boot] navigated to storefront. Drive checkout manually.`);
  console.log(`[boot] all [GA4] console output + relay network traffic will appear below`);
  console.log(`[boot] press Ctrl-C to stop`);

  await new Promise(() => {});
})();
