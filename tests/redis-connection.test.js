// tests/redis-connection.test.js
// Redis connection and queue health tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getRedisConnection,
  checkRedisHealth,
  createQueue,
  enqueueJob,
} from '../src/queue/queues.js';

// Mock Redis
const mockRedis = {
  ping: vi.fn(),
  quit: vi.fn(),
  on: vi.fn(),
  add: vi.fn(),
  getWaiting: vi.fn(),
  getActive: vi.fn(),
  getCompleted: vi.fn(),
  getFailed: vi.fn(),
  getDelayed: vi.fn(),
};

const mockRedisConstructor = vi.fn().mockImplementation(() => mockRedis);

vi.mock('ioredis', () => ({
  Redis: mockRedisConstructor,
}));

describe('Redis Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    delete process.env.REDIS_URL;
    delete process.env.REDIS_PREFIX;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Connection Configuration', () => {
    it('should use default Redis URL when not set', () => {
      getRedisConnection();

      expect(mockRedisConstructor).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.objectContaining({
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          lazyConnect: true,
          prefix: 'smsblossom:dev:',
        }),
      );
    });

    it('should use custom Redis URL when set', () => {
      process.env.REDIS_URL = 'redis://custom:6379';
      process.env.REDIS_PREFIX = 'custom:prefix';

      getRedisConnection();

      expect(mockRedisConstructor).toHaveBeenCalledWith(
        'redis://custom:6379',
        expect.objectContaining({
          prefix: 'custom:prefix:',
        }),
      );
    });

    it('should configure retry strategy', () => {
      getRedisConnection();

      const config = mockRedisConstructor.mock.calls[0][1];
      expect(config.retryStrategy).toBeDefined();
      expect(typeof config.retryStrategy).toBe('function');
    });
  });

  describe('Health Check', () => {
    it('should return true when Redis is healthy', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      const isHealthy = await checkRedisHealth();

      expect(isHealthy).toBe(true);
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should return false when Redis is unhealthy', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'));

      const isHealthy = await checkRedisHealth();

      expect(isHealthy).toBe(false);
    });
  });

  describe('Queue Operations', () => {
    it('should create queue with proper configuration', () => {
      const queue = createQueue('test-queue');

      expect(queue).toBeDefined();
    });

    it('should enqueue job with metadata', async () => {
      const mockJob = { id: 'job_123' };
      mockRedis.add.mockResolvedValue(mockJob);

      const result = await enqueueJob('test-queue', 'test-job', { data: 'test' });

      expect(result).toBe(mockJob);
      expect(mockRedis.add).toHaveBeenCalledWith(
        'test-job',
        expect.objectContaining({
          data: 'test',
          requestId: expect.any(String),
          enqueuedAt: expect.any(String),
        }),
        expect.any(Object),
      );
    });
  });

  describe('Connection Events', () => {
    it('should handle connection events', () => {
      getRedisConnection();

      expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('end', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    });
  });
});
