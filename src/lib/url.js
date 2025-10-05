// src/lib/url.js
// URL parsing utilities

export function parseUtmFromUrl(url) {
  try {
    const u = new URL(url);
    const get = (k) => u.searchParams.get(k) || undefined;
    return {
      utm_source: get('utm_source'),
      utm_medium: get('utm_medium'),
      utm_campaign: get('utm_campaign'),
      utm_term: get('utm_term'),
      utm_content: get('utm_content'),
    };
  } catch {
    return {};
  }
}
