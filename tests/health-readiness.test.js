// tests/health-readiness.test.js
// Health and readiness endpoint tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import healthRouter from '../src/routes/health.js';

// Mock dependencies
vi.mock('../src/db/prismaClient.js', () => ({
  getPrismaClient: vi.fn(() => ({
    $queryRaw: vi.fn(),
  })),
}));

vi.mock('../src/queue/queues.js', () => ({
  checkRedisHealth: vi.fn(),
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Health and Readiness Endpoints', () => {
  let app;
  let mockPrisma;
  let mockCheckRedisHealth;

  beforeEach(async () => {
    app = express();
    app.use('/health', healthRouter);

    // Get mocked functions
    const { getPrismaClient } = await import('../src/db/prismaClient.js');
    const { checkRedisHealth } = await import('../src/queue/queues.js');

    mockPrisma = getPrismaClient();
    mockCheckRedisHealth = checkRedisHealth;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status with all systems healthy', async () => {
      // Mock healthy responses - set up all the calls that will be made
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ health_check: 1 }]) // Database health check
        .mockResolvedValueOnce([{ total: 100, encrypted: 95 }]) // Phone PII check
        .mockResolvedValueOnce([{ total: 100, encrypted: 98 }]); // Email PII check
      mockCheckRedisHealth.mockResolvedValue(true);

      const response = await request(app).get('/health');

      if (response.status !== 200) {
        console.log('Health endpoint error:', response.body);
        console.log('Status:', response.status);
      }

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ok: true,
        version: expect.any(String),
        db: { ok: true, latency_ms: expect.any(Number) },
        redis: { ok: true, latency_ms: expect.any(Number) },
        queues: { ok: true, workers: expect.any(Number) },
        pii: { phone_pct: expect.any(Number), email_pct: expect.any(Number) },
        timestamp: expect.any(String),
        request_id: expect.any(String),
      });
    });

    it('should return health status with database unhealthy', async () => {
      // Mock database failure
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database connection failed'));
      mockCheckRedisHealth.mockResolvedValue(true);

      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        ok: false,
        db: { ok: false, latency_ms: expect.any(Number) },
        redis: { ok: true, latency_ms: expect.any(Number) },
        queues: { ok: true, workers: expect.any(Number) },
      });
    });

    it('should return health status with Redis unhealthy', async () => {
      // Mock Redis failure
      mockPrisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ health_check: 1 }]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: 100, encrypted: 95 }]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: 100, encrypted: 98 }]);
      mockCheckRedisHealth.mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        ok: false,
        db: { ok: true, latency_ms: expect.any(Number) },
        redis: { ok: false, latency_ms: expect.any(Number) },
        queues: { ok: true, workers: expect.any(Number) },
      });
    });

    it('should handle PII coverage timeout gracefully', async () => {
      // Mock PII coverage timeout
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ health_check: 1 }]);
      mockPrisma.$queryRaw.mockRejectedValue(new Error('PII coverage timeout'));
      mockCheckRedisHealth.mockResolvedValue(true);

      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        pii: { phone_pct: null, email_pct: null },
      });
    });

    it('should include request ID in response', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ health_check: 1 }]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: 100, encrypted: 95 }]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ total: 100, encrypted: 98 }]);
      mockCheckRedisHealth.mockResolvedValue(true);

      const response = await request(app)
        .get('/health')
        .set('x-request-id', 'test-request-123')
        .expect(200);

      expect(response.body.request_id).toBe('test-request-123');
    });
  });

  describe('GET /health/ready', () => {
    it('should return 200 when all systems are ready', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);
      mockCheckRedisHealth.mockResolvedValue(true);

      const response = await request(app).get('/health/ready').expect(200);

      expect(response.body).toMatchObject({
        ready: true,
        request_id: expect.any(String),
      });
    });

    it('should return 503 when systems are not ready', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database connection failed'));
      mockCheckRedisHealth.mockResolvedValue(true);

      const response = await request(app).get('/health/ready').expect(503);

      expect(response.body).toMatchObject({
        ready: false,
        db: false,
        redis: true,
        queues: true,
        request_id: expect.any(String),
      });
    });

    it('should return 503 when Redis is not ready', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);
      mockCheckRedisHealth.mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app).get('/health/ready').expect(503);

      expect(response.body).toMatchObject({
        ready: false,
        db: true,
        redis: false,
        queues: true,
        request_id: expect.any(String),
      });
    });
  });
});
