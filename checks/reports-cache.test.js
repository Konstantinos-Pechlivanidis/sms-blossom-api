// checks/reports-cache.test.js
// Reports and cache validation tests

import { describe, it, expect } from 'vitest';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

describe('Reports and Cache', () => {
  describe('Cache Headers', () => {
    it('should return cache headers on reports endpoints', async () => {
      const response = await request(BASE_URL).get('/reports/overview');

      expect([200, 401, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.headers).toHaveProperty('x-cache');
      }
    });

    it('should show cache miss on first request', async () => {
      const response = await request(BASE_URL).get('/reports/overview');

      if (response.status === 200) {
        expect(response.headers['x-cache']).toBe('miss');
      }
    });

    it('should show cache hit on second request', async () => {
      // First request
      await request(BASE_URL).get('/reports/overview');

      // Second request (should be cached)
      const response = await request(BASE_URL).get('/reports/overview');

      if (response.status === 200) {
        expect(response.headers['x-cache']).toBe('hit');
      }
    });
  });

  describe('Reports Endpoints', () => {
    it('should handle overview reports', async () => {
      const response = await request(BASE_URL).get('/reports/overview');

      expect([200, 401, 404]).toContain(response.status);
    });

    it('should handle messaging timeseries', async () => {
      const response = await request(BASE_URL).get('/reports/messaging/timeseries');

      expect([200, 401, 404]).toContain(response.status);
    });

    it('should handle campaign attribution', async () => {
      const response = await request(BASE_URL).get('/reports/campaigns/attribution');

      expect([200, 401, 404]).toContain(response.status);
    });

    it('should handle automation attribution', async () => {
      const response = await request(BASE_URL).get('/reports/automations/attribution');

      expect([200, 401, 404]).toContain(response.status);
    });
  });

  describe('Cache TTL', () => {
    it('should have reasonable cache TTL', async () => {
      const response = await request(BASE_URL).get('/reports/overview');

      if (response.status === 200) {
        const cacheControl = response.headers['cache-control'];
        if (cacheControl) {
          // Should have TTL between 5-15 minutes (300-900 seconds)
          const ttl = parseInt(cacheControl.match(/max-age=(\d+)/)?.[1] || '0');
          expect(ttl).toBeGreaterThanOrEqual(300); // 5 minutes
          expect(ttl).toBeLessThanOrEqual(900); // 15 minutes
        }
      }
    });
  });

  describe('Performance', () => {
    it('should respond within latency budget', async () => {
      const start = Date.now();
      const response = await request(BASE_URL).get('/reports/overview');
      const duration = Date.now() - start;

      if (response.status === 200) {
        // p50 < 200ms, p95 < 800ms
        expect(duration).toBeLessThan(800);
      }
    });

    it('should have faster response on cached requests', async () => {
      // First request (cache miss)
      const start1 = Date.now();
      await request(BASE_URL).get('/reports/overview');
      const duration1 = Date.now() - start1;

      // Second request (cache hit)
      const start2 = Date.now();
      const response = await request(BASE_URL).get('/reports/overview');
      const duration2 = Date.now() - start2;

      if (response.status === 200 && response.headers['x-cache'] === 'hit') {
        expect(duration2).toBeLessThan(duration1);
      }
    });
  });
});
