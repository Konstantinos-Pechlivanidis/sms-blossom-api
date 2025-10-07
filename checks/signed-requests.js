// checks/signed-requests.js
// Helper functions for creating signed requests (HMAC, JWT, App Proxy)

import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Create HMAC signature for Shopify webhooks
 * @param {string} payload - Raw request body
 * @param {string} secret - HMAC secret
 * @returns {string} Base64 encoded HMAC signature
 */
export function createWebhookHmac(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64');
}

/**
 * Create App Proxy HMAC signature
 * @param {string} queryString - Query string to sign
 * @param {string} secret - App Proxy secret
 * @returns {string} HMAC signature
 */
export function createAppProxyHmac(queryString, secret) {
  return crypto.createHmac('sha256', secret).update(queryString, 'utf8').digest('hex');
}

/**
 * Create JWT token for admin authentication
 * @param {Object} payload - JWT payload
 * @param {string} secret - JWT secret
 * @returns {string} JWT token
 */
export function createJwtToken(payload, secret) {
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

/**
 * Create signed App Proxy URL
 * @param {string} baseUrl - Base API URL
 * @param {string} subpath - App Proxy subpath
 * @param {string} shop - Shop domain
 * @param {string} secret - App Proxy secret
 * @returns {string} Signed App Proxy URL
 */
export function createSignedAppProxyUrl(baseUrl, subpath, shop, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const queryString = `shop=${shop}&timestamp=${timestamp}`;
  const signature = createAppProxyHmac(queryString, secret);

  return `${baseUrl}${subpath}?${queryString}&signature=${signature}`;
}

/**
 * Create Shopify webhook payload
 * @param {string} topic - Webhook topic
 * @param {Object} data - Webhook data
 * @returns {Object} Webhook payload with HMAC
 */
export function createWebhookPayload(topic, data, secret) {
  const payload = JSON.stringify(data);
  const hmac = createWebhookHmac(payload, secret);

  return {
    payload,
    headers: {
      'X-Shopify-Topic': topic,
      'X-Shopify-Hmac-Sha256': hmac,
      'Content-Type': 'application/json',
    },
  };
}

/**
 * Create test webhook payloads for common topics
 */
export const TEST_WEBHOOK_PAYLOADS = {
  'orders/paid': {
    id: 123456789,
    order_number: 1001,
    total_price: '29.99',
    currency: 'USD',
    customer: {
      id: 987654321,
      email: 'test@example.com',
      first_name: 'John',
      last_name: 'Doe',
    },
    line_items: [
      {
        id: 111111111,
        title: 'Test Product',
        quantity: 1,
        price: '29.99',
      },
    ],
  },

  'checkouts/update': {
    id: 987654321,
    token: 'test-checkout-token',
    total_price: '29.99',
    currency: 'USD',
    customer: {
      id: 987654321,
      email: 'test@example.com',
      first_name: 'John',
      last_name: 'Doe',
    },
    line_items: [
      {
        id: 111111111,
        title: 'Test Product',
        quantity: 1,
        price: '29.99',
      },
    ],
  },

  'inventory_levels/update': {
    inventory_item_id: 123456789,
    location_id: 987654321,
    available: 10,
    updated_at: new Date().toISOString(),
  },

  'customers/redact': {
    shop_id: 123456789,
    shop_domain: 'test-shop.myshopify.com',
    customer: {
      id: 987654321,
      email: 'test@example.com',
    },
  },

  'shop/redact': {
    shop_id: 123456789,
    shop_domain: 'test-shop.myshopify.com',
  },
};

/**
 * Create test template preview payloads
 */
export const TEST_TEMPLATE_PAYLOADS = {
  order_created: {
    trigger: 'order_created',
    body: 'Hello {{ customer.first_name }}, your order {{ order.number }} is ready! Total: {{ order.total | money }}',
    variables: {
      customer: {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
      },
      order: {
        number: '1001',
        total: 29.99,
        currency: 'USD',
      },
    },
  },

  abandoned_checkout: {
    trigger: 'abandoned_checkout',
    body: 'Hi {{ customer.first_name }}, complete your order: {{ recovery_url }}',
    variables: {
      customer: {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
      },
      checkout: {
        token: 'test-token',
        total: 29.99,
      },
      recovery_url: 'https://test-shop.myshopify.com/checkout/test-token',
    },
  },

  welcome: {
    trigger: 'welcome',
    body: 'Welcome to {{ shop.name }}, {{ customer.first_name }}!',
    variables: {
      customer: {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
      },
      shop: {
        name: 'Test Shop',
        domain: 'test-shop.myshopify.com',
      },
    },
  },
};
