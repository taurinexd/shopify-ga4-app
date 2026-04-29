import { z } from 'zod';

// Shopify endpoints (cart/add.js, cart.js, etc.) often return `null` for
// optional string fields like `variant_title` on single-variant products.
// `.optional()` allows undefined but rejects null, so we accept either.
const optionalString = z.string().optional().nullable();

export const Item = z.object({
  item_id: z.string().min(1),
  item_name: z.string().min(1),
  item_brand: optionalString,
  item_category: optionalString,
  item_category2: optionalString,
  item_category3: optionalString,
  item_category4: optionalString,
  item_category5: optionalString,
  item_variant: optionalString,
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  index: z.number().int().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
});

export const Ecommerce = z.object({
  item_list_id: z.string().optional(),
  item_list_name: z.string().optional(),
  currency: z.string().length(3).optional(),
  value: z.number().nonnegative().optional(),
  transaction_id: z.string().optional(),
  affiliation: z.string().optional(),
  tax: z.number().nonnegative().optional(),
  shipping: z.number().nonnegative().optional(),
  coupon: z.string().optional(),
  items: z.array(Item).min(1),
});

export const GA4Event = z.object({
  event: z.enum([
    'view_item_list', 'select_item', 'view_item',
    'add_to_cart', 'remove_from_cart', 'view_cart',
    'begin_checkout', 'purchase',
  ]),
  ecommerce: Ecommerce,
  event_meta: z.object({
    version: z.string(),
    source: z.string(),
  }).optional(),
});

export type GA4ItemT = z.infer<typeof Item>;
export type GA4EventT = z.infer<typeof GA4Event>;
