// tests/metrics-route.test.js
// Metrics endpoint tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import metricsRouter from '../src/routes/metrics.js';

// Mock dependencies
vi.mock('../src/metrics/index.js', () => ({
  getMetrics: vi.fn(),
  getMetricsAsJson: vi.fn(),
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Metrics Endpoints', () => {
  let app;
  let mockGetMetrics;
  let mockGetMetricsAsJson;

  beforeEach(async () => {
    app = express();
    app.use('/metrics', metricsRouter);

    // Get mocked functions
    const { getMetrics, getMetricsAsJson } = await import('../src/metrics/index.js');
    mockGetMetrics = getMetrics;
    mockGetMetricsAsJson = getMetricsAsJson;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /metrics', () => {
    it('should return metrics without authentication when no token configured', async () => {
      // Clear METRICS_TOKEN
      delete process.env.METRICS_TOKEN;

      const mockMetrics =
        '# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.\n# TYPE process_cpu_user_seconds_total counter\nprocess_cpu_user_seconds_total 0.123\n';
      mockGetMetrics.mockResolvedValue(mockMetrics);

      const response = await request(app).get('/metrics').expect(200);

      expect(response.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8');
      expect(response.text).toBe(mockMetrics);
    });

    it('should require authentication when METRICS_TOKEN is configured', async () => {
      process.env.METRICS_TOKEN = 'test-metrics-token';

      const response = await request(app).get('/metrics').expect(401);

      expect(response.body).toMatchObject({
        error: 'Missing or invalid Authorization header',
        message: 'Use: Authorization: Bearer <METRICS_TOKEN>',
      });
    });

    it('should accept valid metrics token', async () => {
      process.env.METRICS_TOKEN = 'test-metrics-token';

      const mockMetrics =
        '# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.\n# TYPE process_cpu_user_seconds_total counter\nprocess_cpu_user_seconds_total 0.123\n';
      mockGetMetrics.mockResolvedValue(mockMetrics);

      const response = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer test-metrics-token')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8');
      expect(response.text).toBe(mockMetrics);
    });

    it('should reject invalid metrics token', async () => {
      process.env.METRICS_TOKEN = 'test-metrics-token';

      const response = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Invalid metrics token',
      });
    });

    it('should handle metrics collection failure', async () => {
      delete process.env.METRICS_TOKEN;
      mockGetMetrics.mockRejectedValue(new Error('Metrics collection failed'));

      const response = await request(app).get('/metrics').expect(500);

      expect(response.body).toMatchObject({
        error: 'Metrics collection failed',
        request_id: expect.any(String),
      });
    });

    it('should include request ID in error response', async () => {
      delete process.env.METRICS_TOKEN;
      mockGetMetrics.mockRejectedValue(new Error('Metrics collection failed'));

      const response = await request(app)
        .get('/metrics')
        .set('x-request-id', 'test-request-789')
        .expect(500);

      expect(response.body.request_id).toBe('test-request-789');
    });
  });

  describe('GET /metrics/json', () => {
    it('should return JSON metrics without authentication when no token configured', async () => {
      delete process.env.METRICS_TOKEN;

      const mockJsonMetrics = [
        {
          name: 'process_cpu_user_seconds_total',
          help: 'Total user CPU time spent in seconds.',
          type: 'counter',
          values: [{ value: 0.123 }],
        },
      ];
      mockGetMetricsAsJson.mockResolvedValue(mockJsonMetrics);

      const response = await request(app).get('/metrics/json').expect(200);

      expect(response.body).toMatchObject({
        metrics: mockJsonMetrics,
        timestamp: expect.any(String),
        request_id: expect.any(String),
      });
    });

    it('should require authentication when METRICS_TOKEN is configured', async () => {
      process.env.METRICS_TOKEN = 'test-metrics-token';

      const response = await request(app).get('/metrics/json').expect(401);

      expect(response.body).toMatchObject({
        error: 'Missing or invalid Authorization header',
        message: 'Use: Authorization: Bearer <METRICS_TOKEN>',
      });
    });

    it('should handle JSON metrics collection failure', async () => {
      delete process.env.METRICS_TOKEN;
      mockGetMetricsAsJson.mockRejectedValue(new Error('JSON metrics collection failed'));

      const response = await request(app).get('/metrics/json').expect(500);

      expect(response.body).toMatchObject({
        error: 'JSON metrics collection failed',
        request_id: expect.any(String),
      });
    });
  });

  describe('GET /metrics/health', () => {
    it('should return metrics health status', async () => {
      const response = await request(app).get('/metrics/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        endpoint: '/metrics',
        auth_required: false,
        timestamp: expect.any(String),
        request_id: expect.any(String),
      });
    });

    it('should indicate auth is required when METRICS_TOKEN is configured', async () => {
      process.env.METRICS_TOKEN = 'test-metrics-token';

      const response = await request(app).get('/metrics/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        endpoint: '/metrics',
        auth_required: true,
        timestamp: expect.any(String),
        request_id: expect.any(String),
      });
    });
  });
});
