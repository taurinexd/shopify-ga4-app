/**
 * Optional item-field builder shared by all event modules.
 *
 * Shopify endpoints (`/cart.js`, `/cart/add.js`, Liquid product context)
 * routinely return `null` for `vendor`, `product_type`, and
 * `variant_title` on products without those attributes set — most
 * notably for single-variant products where `variant.title === null`.
 *
 * GA4 silently drops the entire event when an item param holds `null`
 * (`/mp/collect` confirms via `/debug/mp/collect` with
 * `VALUE_INVALID: NULL_VALUE`; `/g/collect` is less strict but still
 * normalises the attribute away on aggregation). `JSON.stringify`
 * omits `undefined` keys but serialises `null`, so the difference is
 * load-bearing — we have to *not include the key at all* when the
 * source is null/empty, not just leave it `undefined`.
 *
 * Returns a partial object you spread into the item literal next to
 * `item_id` / `item_name` / `price` / `quantity` / `index`.
 */
export function optionalItemFields(input: {
  brand?: unknown;
  category?: unknown;
  variant?: unknown;
  discount?: unknown;
}): {
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  discount?: number;
} {
  const out: {
    item_brand?: string;
    item_category?: string;
    item_variant?: string;
    discount?: number;
  } = {};
  if (typeof input.brand === 'string' && input.brand) out.item_brand = input.brand;
  if (typeof input.category === 'string' && input.category)
    out.item_category = input.category;
  if (typeof input.variant === 'string' && input.variant)
    out.item_variant = input.variant;
  if (typeof input.discount === 'number' && input.discount > 0)
    out.discount = input.discount;
  return out;
}
