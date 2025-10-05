// src/services/recovery-url.js
// Recovery URL builder for abandoned checkout with discount + UTM + shortlink support

/**
 * Build a recovery URL for abandoned checkout.
 * Prefers payload-provided recovery URLs, falls back to storefront cart.
 * Appends discount=CODE and UTM params if provided.
 * Optionally produce a shortlink (feature flag SHORTLINKS_ENABLED=1).
 */

export function pickBaseRecoveryUrl({ shopDomain, payload }) {
  // try multiple known fields in webhook payload
  const u =
    payload?.recovery_url || payload?.abandoned_checkout_url || payload?.recoveryUrl || null;
  if (u && typeof u === 'string') return u;
  return `https://${shopDomain}/cart`;
}

export function appendQueryParams(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '') continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

export async function buildRecoveryUrl({
  shopId: _shopId,
  shopDomain,
  payload,
  discountCode = null,
  utm = { utm_source: 'sms', utm_medium: 'sms', utm_campaign: 'abandoned_checkout' },
  useShortlink = !!process.env.SHORTLINKS_ENABLED,
}) {
  let url = pickBaseRecoveryUrl({ shopDomain, payload });
  // Shopify applies discount code if passed as query param
  if (discountCode) url = appendQueryParams(url, { discount: discountCode });
  if (utm) url = appendQueryParams(url, utm);

  if (!useShortlink) return url;

  // TODO: Implement shortlink service when needed
  // const s = await createShortlink({ shopId, url, campaignId: null }).catch(() => null);
  // return s?.url || url;

  return url;
}
