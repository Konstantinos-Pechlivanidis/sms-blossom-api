import crypto from 'node:crypto';

// Verify Shopify App Proxy signature per docs
export function verifyAppProxySignature(query, appSecret = process.env.SHOPIFY_API_SECRET) {
  const q = { ...query };
  const signature = q.signature;
  if (!signature) return false;
  delete q.signature;

  const parts = Object.entries(q).map(
    ([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : (v ?? '')}`,
  );
  const sorted = parts.sort().join('');
  const h = crypto.createHmac('sha256', appSecret).update(sorted).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(h, 'hex'));
  } catch {
    return false;
  }
}
