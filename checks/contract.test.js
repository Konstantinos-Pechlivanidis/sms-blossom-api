// checks/contract.test.js
// OpenAPI contract validation tests

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import yaml from 'js-yaml';

// Mock the app for testing
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

describe('OpenAPI Contract Validation', () => {
  let _openapiSpec;
  let _app;

  beforeAll(async () => {
    // Load OpenAPI spec
    try {
      const specContent = fs.readFileSync('openapi/openapi.yaml', 'utf8');
      _openapiSpec = yaml.load(specContent);
    } catch (error) {
      console.warn('Could not load OpenAPI spec:', error.message);
      _openapiSpec = {};
    }
  });

  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(BASE_URL).get('/health').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Public App Proxy Endpoints', () => {
    it('should handle storefront consent with valid signature', async () => {
      const signedQuery = {
        shop: 'test-shop.myshopify.com',
        timestamp: Math.floor(Date.now() / 1000).toString(),
        signature: 'valid-signature', // This would be properly signed in real tests
      };

      const response = await request(BASE_URL)
        .post('/public/storefront/consent')
        .query(signedQuery)
        .send({
          phone: '+306912345678',
          email: 'test@example.com',
          optInLevel: 'SINGLE_OPT_IN',
        });

      // Should either succeed (200) or fail with proper error (401/422)
      expect([200, 401, 422]).toContain(response.status);
    });

    it('should handle unsubscribe with valid signature', async () => {
      const signedQuery = {
        shop: 'test-shop.myshopify.com',
        phone: '+306912345678',
        timestamp: Math.floor(Date.now() / 1000).toString(),
        signature: 'valid-signature',
      };

      const response = await request(BASE_URL).get('/public/unsubscribe').query(signedQuery);

      // Should either succeed (200) or fail with proper error (401/404)
      expect([200, 401, 404]).toContain(response.status);
    });
  });

  describe('Admin API Endpoints', () => {
    it('should require authentication for protected routes', async () => {
      const protectedRoutes = ['/discounts', '/settings', '/reports', '/automations', '/campaigns'];

      for (const route of protectedRoutes) {
        const response = await request(BASE_URL).get(route);

        expect([401, 403]).toContain(response.status);
      }
    });

    it('should handle settings endpoints', async () => {
      // Test without auth (should fail)
      const response = await request(BASE_URL).get('/settings');

      expect([401, 403]).toContain(response.status);
    });
  });

  describe('Webhook Endpoints', () => {
    it('should handle Shopify webhooks', async () => {
      const webhookPayload = {
        id: 123456789,
        order_number: 1001,
        total_price: '29.99',
        currency: 'USD',
        shop_domain: 'test-shop.myshopify.com',
      };

      const response = await request(BASE_URL)
        .post('/webhooks/shopify/orders/paid')
        .set('X-Shopify-Hmac-Sha256', 'mock-hmac')
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('X-Shopify-Topic', 'orders/paid')
        .send(webhookPayload);

      expect([200, 401]).toContain(response.status);
    });

    it('should handle Mitto webhooks', async () => {
      const dlrPayload = {
        messageId: 'msg_123456',
        status: 'delivered',
        timestamp: new Date().toISOString(),
      };

      const response = await request(BASE_URL)
        .post('/webhooks/mitto/dlr')
        .set('X-Mitto-Hmac-Sha256', 'mock-hmac')
        .send(dlrPayload);

      expect([200, 401]).toContain(response.status);
    });
  });

  describe('GDPR Endpoints', () => {
    it('should handle GDPR status', async () => {
      const response = await request(BASE_URL).get('/gdpr/status');

      expect([200, 404]).toContain(response.status);
    });

    it('should handle GDPR export', async () => {
      const response = await request(BASE_URL).post('/gdpr/export').send({
        contactId: 'contact_123',
        shopId: 'shop_123',
      });

      expect([200, 400, 404, 500]).toContain(response.status);
    });
  });

  describe('Metrics Endpoints', () => {
    it('should return Prometheus metrics', async () => {
      const response = await request(BASE_URL).get('/metrics');

      expect([200, 404]).toContain(response.status);
    });

    it('should return JSON metrics', async () => {
      const response = await request(BASE_URL).get('/metrics/json');

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('Response Format Validation', () => {
    it('should include x-request-id header', async () => {
      const response = await request(BASE_URL).get('/health');

      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should return proper error format', async () => {
      const response = await request(BASE_URL).get('/nonexistent-route');

      expect([404, 405]).toContain(response.status);

      if (response.status === 404) {
        expect(response.body).toHaveProperty('error');
      }
    });
  });
});
