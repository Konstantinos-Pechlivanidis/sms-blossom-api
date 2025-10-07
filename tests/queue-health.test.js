// tests/queue-health.test.js
// Queue health endpoint tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import queueHealthRouter from '../src/routes/queue-health.js';

// Mock dependencies
vi.mock('../src/queue/queues.js', () => ({
  getQueue: vi.fn(),
  getRedisConnection: vi.fn(),
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Queue Health Endpoints', () => {
  let app;
  let mockGetQueue;
  let mockGetRedisConnection;
  let mockRedis;
  let mockQueue;

  beforeEach(async () => {
    app = express();
    app.use('/queue', queueHealthRouter);

    // Get mocked functions
    const { getQueue, getRedisConnection } = await import('../src/queue/queues.js');
    mockGetQueue = getQueue;
    mockGetRedisConnection = getRedisConnection;

    // Mock Redis connection
    mockRedis = {
      ping: vi.fn(),
    };
    mockGetRedisConnection.mockReturnValue(mockRedis);

    // Mock queue
    mockQueue = {
      getWaiting: vi.fn(),
      getActive: vi.fn(),
      getCompleted: vi.fn(),
      getFailed: vi.fn(),
      getDelayed: vi.fn(),
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /queue/health', () => {
    it('should return queue health with Redis connected', async () => {
      // Mock Redis healthy
      mockRedis.ping.mockResolvedValue('PONG');

      // Mock queue counts
      mockQueue.getWaiting.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockQueue.getActive.mockResolvedValue([{ id: 3 }]);
      mockQueue.getCompleted.mockResolvedValue([{ id: 4 }, { id: 5 }, { id: 6 }]);
      mockQueue.getFailed.mockResolvedValue([{ id: 7 }]);
      mockQueue.getDelayed.mockResolvedValue([]);

      // Mock all queues
      mockGetQueue.mockReturnValue(mockQueue);

      const response = await request(app).get('/queue/health').expect(200);

      expect(response.body).toMatchObject({
        redis: true,
        queues: {
          events: { waiting: 2, active: 1, completed: 3, failed: 1, delayed: 0 },
          automations: { waiting: 2, active: 1, completed: 3, failed: 1, delayed: 0 },
          campaigns: { waiting: 2, active: 1, completed: 3, failed: 1, delayed: 0 },
          delivery: { waiting: 2, active: 1, completed: 3, failed: 1, delayed: 0 },
          housekeeping: { waiting: 2, active: 1, completed: 3, failed: 1, delayed: 0 },
        },
        dlq: { events_dead: 1, delivery_dead: 1 },
        timestamp: expect.any(String),
        request_id: expect.any(String),
      });
    });

    it('should return queue health with Redis disconnected', async () => {
      // Mock Redis disconnected
      mockGetRedisConnection.mockReturnValue(null);

      const response = await request(app).get('/queue/health').expect(200);

      expect(response.body).toMatchObject({
        redis: false,
        queues: {},
        dlq: { events_dead: 0, delivery_dead: 0 },
        timestamp: expect.any(String),
        request_id: expect.any(String),
      });
    });

    it('should handle Redis ping failure gracefully', async () => {
      // Mock Redis ping failure
      mockRedis.ping.mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app).get('/queue/health').expect(200);

      expect(response.body).toMatchObject({
        redis: false,
        queues: {},
        dlq: { events_dead: 0, delivery_dead: 0 },
      });
    });

    it('should handle queue count failures gracefully', async () => {
      // Mock Redis healthy
      mockRedis.ping.mockResolvedValue('PONG');

      // Mock queue count failure
      mockQueue.getWaiting.mockRejectedValue(new Error('Queue count failed'));
      mockGetQueue.mockReturnValue(mockQueue);

      const response = await request(app).get('/queue/health').expect(200);

      expect(response.body).toMatchObject({
        redis: true,
        queues: {
          events: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
          automations: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
          campaigns: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
          delivery: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
          housekeeping: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        },
      });
    });

    it('should include request ID in response', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockGetQueue.mockReturnValue(mockQueue);
      mockQueue.getWaiting.mockResolvedValue([]);
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getCompleted.mockResolvedValue([]);
      mockQueue.getFailed.mockResolvedValue([]);
      mockQueue.getDelayed.mockResolvedValue([]);

      const response = await request(app)
        .get('/queue/health')
        .set('x-request-id', 'test-request-456')
        .expect(200);

      expect(response.body.request_id).toBe('test-request-456');
    });
  });

  describe('GET /queue/metrics', () => {
    it('should return queue metrics when Redis is available', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockQueue.getWaiting.mockResolvedValue([{ id: 1 }]);
      mockQueue.getActive.mockResolvedValue([{ id: 2 }]);
      mockQueue.getCompleted.mockResolvedValue([{ id: 3 }]);
      mockQueue.getFailed.mockResolvedValue([{ id: 4 }]);
      mockQueue.getDelayed.mockResolvedValue([{ id: 5 }]);
      mockGetQueue.mockReturnValue(mockQueue);

      const response = await request(app).get('/queue/metrics').expect(200);

      expect(response.body).toMatchObject({
        metrics: expect.arrayContaining([
          expect.objectContaining({
            queue: 'events',
            waiting: 1,
            active: 1,
            completed: 1,
            failed: 1,
            delayed: 1,
          }),
        ]),
        timestamp: expect.any(String),
        request_id: expect.any(String),
      });
    });

    it('should return 503 when Redis is not available', async () => {
      mockGetRedisConnection.mockReturnValue(null);

      const response = await request(app).get('/queue/metrics').expect(503);

      expect(response.body).toMatchObject({
        error: 'Redis not available',
        request_id: expect.any(String),
      });
    });
  });
});
