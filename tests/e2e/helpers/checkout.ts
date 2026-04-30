import type { Page } from '@playwright/test';

/**
 * Drive Shopify's modern checkout end-to-end with a Bogus Gateway
 * payment. Lives in a helper because the selectors are brittle
 * enough that a single source of truth saves a lot of pain the next
 * time Shopify ships a checkout UI revision.
 *
 * Modern checkout (2023+ revisions, what the dev store ships today)
 * is a single-page React app on `/checkouts/cn/{token}/...`. Field
 * markup is dynamic but accessible labels are part of the contract
 * Shopify maintains, so we lean exclusively on `getByLabel(...)` and
 * `getByRole(...)` rather than CSS selectors that target generated
 * class names or `name=""` attributes.
 *
 * Bogus Gateway accepts the literal card number `1` for a successful
 * authorisation — see https://help.shopify.com/manual/checkout-settings/test-orders
 *
 * The helper is intentionally tolerant:
 *  - if the page is already on a later step (e.g. dev store autofill
 *    from a previous order), missing inputs are skipped
 *  - if Cloudflare's "verify your connection" interstitial fires,
 *    the helper throws `CLOUDFLARE_INTERSTITIAL` so the spec can
 *    `test.skip` rather than report a misleading timeout
 *  - each "Continue/Pay" submit is paired with a `waitForLoadState`
 *    so the next step's labels are queried after React re-renders
 */
export async function completeBogusCheckout(page: Page): Promise<void> {
  await assertNotInterstitial(page);

  // Contact + Delivery step ----------------------------------------
  await fillByLabelIfPresent(page, /email|mobile phone/i, 'qa-purchase-test@example.com');

  // The dev store sells in EU + US (per markets config); the test
  // ships to Italy because card 1 + Bogus Gateway works in any
  // region and IT is one of the markets the brief implicitly cares
  // about (Customer Privacy banner only fires in regulated regions).
  await selectByLabelIfPresent(page, /country|region/i, 'Italy');

  await fillByLabelIfPresent(page, /first name/i, 'Test');
  await fillByLabelIfPresent(page, /last name/i, 'Buyer');
  await fillByLabelIfPresent(page, /^address$|address line 1|street/i, 'Via Roma 1');
  await fillByLabelIfPresent(page, /city|town/i, 'Milano');
  await fillByLabelIfPresent(page, /postal|zip/i, '20121');
  await fillByLabelIfPresent(page, /^phone|telephone/i, '+393331234567');

  // Italy doesn't require a province/state field — but if Shopify
  // still surfaces it (e.g. when reverting from US autofill) pick
  // any value so validation passes.
  await selectByLabelIfPresent(page, /province|state/i, undefined);

  await clickContinueOrPay(page, /continue to shipping|continue/i);

  // Shipping method step (auto-selects first option on dev store)
  await clickContinueOrPay(page, /continue to payment|continue/i);

  // Payment step --------------------------------------------------
  await selectBogusGatewayIfPresent(page);

  // Card number `1` = success per Shopify Bogus Gateway docs.
  // Card fields on modern checkout are NOT in an iframe (Bogus
  // Gateway is server-side, no PCI iframe needed).
  await fillByLabelIfPresent(page, /card number/i, '1');
  await fillByLabelIfPresent(page, /name on card|cardholder/i, 'Test Buyer');
  await fillByLabelIfPresent(page, /expir(ation|y)|valid (until|thru)/i, '12 / 30');
  await fillByLabelIfPresent(page, /security code|cvv|cvc/i, '123');

  await clickContinueOrPay(page, /pay now|complete order|place order/i);
}

async function assertNotInterstitial(page: Page): Promise<void> {
  const text = await page.textContent('body').catch(() => '');
  if (text && /verified before you can proceed|just a moment/i.test(text)) {
    throw new Error('CLOUDFLARE_INTERSTITIAL');
  }
}

async function fillByLabelIfPresent(
  page: Page,
  label: RegExp,
  value: string,
): Promise<void> {
  const loc = page.getByLabel(label).first();
  if (await loc.count() === 0) return;
  if (!(await loc.isVisible().catch(() => false))) return;
  if (!(await loc.isEditable().catch(() => false))) return;
  await loc.fill(value);
}

async function selectByLabelIfPresent(
  page: Page,
  label: RegExp,
  value: string | undefined,
): Promise<void> {
  const loc = page.getByLabel(label).first();
  if (await loc.count() === 0) return;
  if (!(await loc.isVisible().catch(() => false))) return;
  // If the caller passed undefined we just want to ensure *something*
  // is selected (e.g. province/state on a country that lists them) —
  // pick the first non-placeholder option Shopify renders.
  try {
    if (value !== undefined) {
      await loc.selectOption({ label: value });
    } else {
      await loc.selectOption({ index: 1 }).catch(() => undefined);
    }
  } catch {
    /* not a <select>, or option not available — skip */
  }
}

async function clickContinueOrPay(page: Page, name: RegExp): Promise<void> {
  const button = page.getByRole('button', { name }).first();
  if (await button.count() === 0) return;
  if (!(await button.isEnabled().catch(() => false))) return;
  await button.click();
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
  // Shopify's checkout React app re-renders the next step async; wait
  // a beat so the next selector pass queries the new DOM, not the
  // previous step that's still in the document for a few hundred ms.
  await page.waitForTimeout(500);
}

async function selectBogusGatewayIfPresent(page: Page): Promise<void> {
  const bogus = page.getByRole('radio', { name: /bogus|simulazione|test gateway/i });
  if (await bogus.count() === 0) return;
  const isChecked = await bogus.first().isChecked().catch(() => true);
  if (!isChecked) {
    await bogus.first().click().catch(() => undefined);
  }
}
