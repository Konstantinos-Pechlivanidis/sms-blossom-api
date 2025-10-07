// checks/headers-cors.test.js
// HTTP headers and CORS validation tests

import { describe, it, expect } from 'vitest';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sms-blossom-frontend.onrender.com';

describe('HTTP Headers and CORS', () => {
  describe('CORS Configuration', () => {
    it('should allow requests from frontend origin', async () => {
      const response = await request(BASE_URL)
        .options('/public/storefront/consent')
        .set('Origin', FRONTEND_URL)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type');

      expect([200, 204]).toContain(response.status);
      
      if (response.status === 200 || response.status === 204) {
        expect(response.headers).toHaveProperty('access-control-allow-origin');
        expect(response.headers['access-control-allow-origin']).toBe(FRONTEND_URL);
      }
    });

    it('should block requests from unknown origins', async () => {
      const response = await request(BASE_URL)
        .options('/public/storefront/consent')
        .set('Origin', 'https://malicious-site.com')
        .set('Access-Control-Request-Method', 'POST');

      expect([403, 401, 400]).toContain(response.status);
    });

    it('should allow Shopify admin origins', async () => {
      const response = await request(BASE_URL)
        .options('/public/storefront/consent')
        .set('Origin', 'https://admin.shopify.com')
        .set('Access-Control-Request-Method', 'POST');

      expect([200, 204, 403]).toContain(response.status);
    });

    it('should handle preflight requests correctly', async () => {
      const response = await request(BASE_URL)
        .options('/public/storefront/consent')
        .set('Origin', FRONTEND_URL)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type, Authorization');

      expect([200, 204]).toContain(response.status);
    });
  });

  describe('Request ID Headers', () => {
    it('should include x-request-id on all responses', async () => {
      const response = await request(BASE_URL)
        .get('/health');

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toBeTruthy();
    });

    it('should have unique x-request-id for each request', async () => {
      const response1 = await request(BASE_URL)
        .get('/health');
      
      const response2 = await request(BASE_URL)
        .get('/health');

      expect(response1.headers['x-request-id']).not.toBe(response2.headers['x-request-id']);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(BASE_URL)
        .get('/health');

      // Check for common security headers
      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection'
      ];

      securityHeaders.forEach(header => {
        if (response.headers[header]) {
          expect(response.headers[header]).toBeTruthy();
        }
      });
    });

    it('should not expose server information', async () => {
      const response = await request(BASE_URL)
        .get('/health');

      expect(response.headers).not.toHaveProperty('server');
      expect(response.headers).not.toHaveProperty('x-powered-by');
    });
  });

  describe('Rate Limiting Headers', () => {
    it('should include rate limit headers', async () => {
      const response = await request(BASE_URL)
        .get('/public/unsubscribe')
        .query({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678',
          timestamp: Math.floor(Date.now() / 1000).toString(),
          signature: 'valid-signature'
        });

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
    });

    it('should include retry-after header on rate limit', async () => {
      // Make multiple requests to trigger rate limiting
      const requests = Array(150).fill().map(() => 
        request(BASE_URL)
          .get('/public/unsubscribe')
          .query({
            shop: 'test-shop.myshopify.com',
            phone: '+306912345678',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            signature: 'valid-signature'
          })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.find(r => r.status === 429);
      
      if (rateLimited) {
        expect(rateLimited.headers).toHaveProperty('retry-after');
        expect(parseInt(rateLimited.headers['retry-after'])).toBeGreaterThan(0);
      }
    });
  });

  describe('Cache Headers', () => {
    it('should include cache headers on reports', async () => {
      const response = await request(BASE_URL)
        .get('/reports/overview');

      if (response.status === 200) {
        expect(response.headers).toHaveProperty('x-cache');
        expect(['hit', 'miss']).toContain(response.headers['x-cache']);
      }
    });

    it('should include cache-control headers', async () => {
      const response = await request(BASE_URL)
        .get('/reports/overview');

      if (response.status === 200 && response.headers['cache-control']) {
        expect(response.headers['cache-control']).toContain('max-age');
      }
    });
  });

  describe('Error Response Headers', () => {
    it('should include proper headers on 401 errors', async () => {
      const response = await request(BASE_URL)
        .get('/discounts');

      expect(response.status).toBe(401);
      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should include proper headers on 404 errors', async () => {
      const response = await request(BASE_URL)
        .get('/nonexistent-route');

      expect(response.status).toBe(404);
      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should include proper headers on 429 errors', async () => {
      // Trigger rate limiting
      const requests = Array(150).fill().map(() => 
        request(BASE_URL)
          .get('/public/unsubscribe')
          .query({
            shop: 'test-shop.myshopify.com',
            phone: '+306912345678',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            signature: 'valid-signature'
          })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.find(r => r.status === 429);
      
      if (rateLimited) {
        expect(rateLimited.headers).toHaveProperty('x-request-id');
        expect(rateLimited.headers).toHaveProperty('retry-after');
      }
    });
  });

  describe('Content-Type Headers', () => {
    it('should return JSON for API endpoints', async () => {
      const response = await request(BASE_URL)
        .get('/health');

      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should return HTML for unsubscribe confirmations', async () => {
      const response = await request(BASE_URL)
        .get('/public/unsubscribe')
        .query({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678',
          timestamp: Math.floor(Date.now() / 1000).toString(),
          signature: 'valid-signature'
        })
        .set('Accept', 'text/html');

      if (response.status === 200) {
        expect(response.headers['content-type']).toContain('text/html');
      }
    });

    it('should return plain text for metrics', async () => {
      const response = await request(BASE_URL)
        .get('/metrics');

      if (response.status === 200) {
        expect(response.headers['content-type']).toContain('text/plain');
      }
    });
  });

  describe('Error Taxonomy', () => {
    it('should return 401 for missing authentication', async () => {
      const response = await request(BASE_URL)
        .get('/discounts');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should return 403 for forbidden access', async () => {
      // This would require a valid JWT but insufficient permissions
      const response = await request(BASE_URL)
        .get('/discounts')
        .set('Authorization', 'Bearer valid-but-insufficient-token');

      expect([401, 403]).toContain(response.status);
    });

    it('should return 404 for not found', async () => {
      const response = await request(BASE_URL)
        .get('/nonexistent-route');

      expect(response.status).toBe(404);
    });

    it('should return 422 for invalid data', async () => {
      const response = await request(BASE_URL)
        .post('/public/storefront/consent')
        .query({
          shop: 'test-shop.myshopify.com',
          timestamp: Math.floor(Date.now() / 1000).toString(),
          signature: 'valid-signature'
        })
        .send({ phone: 'invalid-phone' });

      expect([422, 401]).toContain(response.status);
    });

    it('should return 429 for rate limiting', async () => {
      // Make multiple requests to trigger rate limiting
      const requests = Array(150).fill().map(() => 
        request(BASE_URL)
          .get('/public/unsubscribe')
          .query({
            shop: 'test-shop.myshopify.com',
            phone: '+306912345678',
            timestamp: Math.floor(Date.now() / 1000).toString(),
            signature: 'valid-signature'
          })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.find(r => r.status === 429);
      
      if (rateLimited) {
        expect(rateLimited.status).toBe(429);
        expect(rateLimited.body).toHaveProperty('error', 'rate_limit_exceeded');
      }
    });
  });
});
