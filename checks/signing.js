// checks/signing.js
// HMAC signing utilities for App Proxy and Webhooks

import crypto from 'crypto';

/**
 * Generate HMAC signature for App Proxy requests
 * @param {object} query - Query parameters
 * @param {string} secret - Shopify API secret
 * @returns {string} - HMAC signature
 */
export function signAppProxy(query, secret = process.env.SHOPIFY_API_SECRET) {
  const q = { ...query };
  delete q.signature;
  
  const parts = Object.entries(q)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : (v ?? '')}`)
    .sort();
  
  const sorted = parts.join('');
  return crypto.createHmac('sha256', secret).update(sorted).digest('hex');
}

/**
 * Generate HMAC signature for Shopify webhooks
 * @param {string} body - Raw request body
 * @param {string} secret - Webhook secret
 * @returns {string} - HMAC signature
 */
export function signWebhook(body, secret = process.env.WEBHOOK_HMAC_SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

/**
 * Generate HMAC signature for Mitto webhooks
 * @param {string} body - Raw request body
 * @param {string} secret - Mitto HMAC secret
 * @returns {string} - HMAC signature
 */
export function signMittoWebhook(body, secret = process.env.MITTO_HMAC_SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Create signed App Proxy query parameters
 * @param {object} params - Base parameters
 * @param {string} secret - Shopify API secret
 * @returns {object} - Parameters with signature
 */
export function createSignedAppProxyQuery(params, secret = process.env.SHOPIFY_API_SECRET) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const query = {
    ...params,
    timestamp
  };
  
  const signature = signAppProxy(query, secret);
  
  return {
    ...query,
    signature
  };
}

/**
 * Create signed webhook payload
 * @param {object} payload - Webhook payload
 * @param {string} secret - Webhook secret
 * @returns {object} - Headers and body for webhook request
 */
export function createSignedWebhook(payload, secret = process.env.WEBHOOK_HMAC_SECRET) {
  const body = JSON.stringify(payload);
  const signature = signWebhook(body, secret);
  
  return {
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Hmac-Sha256': signature,
      'X-Shopify-Shop-Domain': payload.shop_domain || 'test-shop.myshopify.com',
      'X-Shopify-Topic': payload.topic || 'orders/paid'
    },
    body
  };
}

/**
 * Create signed Mitto webhook payload
 * @param {object} payload - Mitto webhook payload
 * @param {string} secret - Mitto HMAC secret
 * @returns {object} - Headers and body for Mitto webhook request
 */
export function createSignedMittoWebhook(payload, secret = process.env.MITTO_HMAC_SECRET) {
  const body = JSON.stringify(payload);
  const signature = signMittoWebhook(body, secret);
  
  return {
    headers: {
      'Content-Type': 'application/json',
      'X-Mitto-Hmac-Sha256': signature
    },
    body
  };
}
