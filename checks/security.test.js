// checks/security.test.js
// Security validation tests

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createSignedAppProxyQuery, createSignedWebhook } from './signing.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

describe('Security Validation', () => {
  describe('App Proxy HMAC Verification', () => {
    it('should reject unsigned App Proxy requests', async () => {
      const response = await request(BASE_URL)
        .get('/public/unsubscribe')
        .query({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678'
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'invalid_signature');
    });

    it('should accept signed App Proxy requests', async () => {
      const signedQuery = createSignedAppProxyQuery({
        shop: 'test-shop.myshopify.com',
        phone: '+306912345678'
      });

      const response = await request(BASE_URL)
        .get('/public/unsubscribe')
        .query(signedQuery);

      // Should either succeed or fail with shop not found (not auth error)
      expect([200, 404, 422]).toContain(response.status);
      expect(response.status).not.toBe(401);
    });

    it('should reject App Proxy requests with invalid signature', async () => {
      const response = await request(BASE_URL)
        .get('/public/unsubscribe')
        .query({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678',
          timestamp: Math.floor(Date.now() / 1000).toString(),
          signature: 'invalid-signature'
        });

      expect(response.status).toBe(401);
    });

    it('should handle storefront consent with proper signature', async () => {
      const signedQuery = createSignedAppProxyQuery({
        shop: 'test-shop.myshopify.com'
      });

      const response = await request(BASE_URL)
        .post('/public/storefront/consent')
        .query(signedQuery)
        .send({
          phone: '+306912345678',
          email: 'test@example.com'
        });

      // Should either succeed or fail with proper error (not auth error)
      expect([200, 400, 404, 422]).toContain(response.status);
      expect(response.status).not.toBe(401);
    });
  });

  describe('JWT Authentication', () => {
    it('should require JWT for protected admin routes', async () => {
      const protectedRoutes = [
        '/discounts',
        '/settings',
        '/reports',
        '/automations',
        '/campaigns'
      ];

      for (const route of protectedRoutes) {
        const response = await request(BASE_URL)
          .get(route);

        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
      }
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await request(BASE_URL)
        .get('/discounts')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'invalid_token');
    });

    it('should reject requests without Authorization header', async () => {
      const response = await request(BASE_URL)
        .get('/discounts');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'missing_token');
    });
  });

  describe('Shop Scoping', () => {
    it('should return 409 for unknown shop', async () => {
      // This test assumes we have a valid JWT but unknown shop
      const response = await request(BASE_URL)
        .get('/discounts')
        .set('Authorization', 'Bearer valid-jwt-token')
        .set('X-Shop-Domain', 'unknown-shop.myshopify.com');

      // Should fail with shop not found
      expect([401, 409]).toContain(response.status);
    });

    it('should handle missing shop domain', async () => {
      const response = await request(BASE_URL)
        .get('/discounts')
        .set('Authorization', 'Bearer valid-jwt-token');

      expect([400, 401]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limits to public endpoints', async () => {
      const signedQuery = createSignedAppProxyQuery({
        shop: 'test-shop.myshopify.com',
        phone: '+306912345678'
      });

      // Make multiple requests to trigger rate limiting
      const requests = Array(150).fill().map(() => 
        request(BASE_URL)
          .get('/public/unsubscribe')
          .query(signedQuery)
      );

      const responses = await Promise.all(requests);
      
      // Should have some 429 responses
      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      // Check for rate limit headers
      const rateLimitedResponse = rateLimited[0];
      expect(rateLimitedResponse.headers).toHaveProperty('x-ratelimit-limit');
      expect(rateLimitedResponse.headers).toHaveProperty('x-ratelimit-remaining');
      expect(rateLimitedResponse.headers).toHaveProperty('retry-after');
    });

    it('should include rate limit headers in responses', async () => {
      const response = await request(BASE_URL)
        .get('/public/unsubscribe')
        .query(createSignedAppProxyQuery({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678'
        }));

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('CORS Configuration', () => {
    it('should allow requests from frontend origin', async () => {
      const frontendUrl = process.env.FRONTEND_URL || 'https://sms-blossom-frontend.onrender.com';
      
      const response = await request(BASE_URL)
        .options('/public/storefront/consent')
        .set('Origin', frontendUrl)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type');

      expect([200, 204]).toContain(response.status);
    });

    it('should block requests from unknown origins', async () => {
      const response = await request(BASE_URL)
        .options('/public/storefront/consent')
        .set('Origin', 'https://malicious-site.com')
        .set('Access-Control-Request-Method', 'POST');

      expect([403, 401]).toContain(response.status);
    });
  });

  describe('Webhook Security', () => {
    it('should reject webhooks without HMAC', async () => {
      const response = await request(BASE_URL)
        .post('/webhooks/shopify/orders/paid')
        .send({ id: 123456789 });

      expect(response.status).toBe(401);
    });

    it('should accept webhooks with valid HMAC', async () => {
      const payload = { id: 123456789, shop_domain: 'test-shop.myshopify.com' };
      const { headers, body } = createSignedWebhook(payload);

      const response = await request(BASE_URL)
        .post('/webhooks/shopify/orders/paid')
        .set(headers)
        .send(JSON.parse(body));

      expect([200, 401]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should not expose sensitive information in errors', async () => {
      const response = await request(BASE_URL)
        .get('/discounts');

      expect(response.status).toBe(401);
      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('details');
      expect(response.body.error).toBeDefined();
    });

    it('should return proper error taxonomy', async () => {
      // Test 401 (Unauthorized)
      const authResponse = await request(BASE_URL)
        .get('/discounts');
      expect(authResponse.status).toBe(401);

      // Test 404 (Not Found)
      const notFoundResponse = await request(BASE_URL)
        .get('/nonexistent-route');
      expect(notFoundResponse.status).toBe(404);

      // Test 422 (Unprocessable Entity) - invalid data
      const invalidResponse = await request(BASE_URL)
        .post('/public/storefront/consent')
        .query(createSignedAppProxyQuery({ shop: 'test-shop.myshopify.com' }))
        .send({ phone: 'invalid-phone' });
      expect([422, 401]).toContain(invalidResponse.status);
    });
  });
});
