// src/services/utm.js
// UTM helpers for campaign tracking

export function normalizeUtm(input = {}) {
  const base = { utm_source: 'sms', utm_medium: 'sms' };
  const merged = { ...base, ...input };
  // scrub falsy
  for (const k of Object.keys(merged)) if (merged[k] == null || merged[k] === '') delete merged[k];
  return merged;
}

export function appendUtm(url, utm = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(normalizeUtm(utm))) u.searchParams.set(k, String(v));
  return u.toString();
}
