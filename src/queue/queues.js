// src/queue/queues.js
// BullMQ queue factory and configuration

import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../lib/logger.js';

// Redis connection factory
let redisConnection = null;

/**
 * Get or create Redis connection with health check
 * @returns {Redis} Redis connection instance
 */
export function getRedisConnection() {
  if (!redisConnection) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const prefix = process.env.REDIS_PREFIX || 'smsblossom:dev';

    redisConnection = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: null, // For serverless/managed Redis
      enableReadyCheck: false, // For serverless/managed Redis
      lazyConnect: true,
      prefix: `${prefix}:`,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 5000);
        logger.warn({ times, delay }, 'Redis retry strategy');
        return delay;
      },
    });

    // Health check
    redisConnection.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisConnection.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });

    redisConnection.on('end', () => {
      logger.warn('Redis connection ended');
    });

    redisConnection.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    // Graceful shutdown
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }

  return redisConnection;
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown() {
  logger.info('Received shutdown signal, draining workers...');

  if (redisConnection) {
    await redisConnection.quit();
    logger.info('Redis connection closed');
  }

  process.exit(0);
}

/**
 * Queue factory with consistent configuration
 * @param {string} name - Queue name
 * @param {Object} options - Queue options
 * @returns {Queue} BullMQ queue instance
 */
export function createQueue(name, options = {}) {
  const connection = getRedisConnection();

  const defaultOptions = {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  };

  return new Queue(name, { ...defaultOptions, ...options });
}

/**
 * Worker factory with consistent configuration
 * @param {string} queueName - Queue name
 * @param {Function} processor - Job processor function
 * @param {Object} options - Worker options
 * @returns {Worker} BullMQ worker instance
 */
export function createWorker(queueName, processor, options = {}) {
  const connection = getRedisConnection();

  const defaultOptions = {
    connection,
    concurrency: 5,
    removeOnComplete: 100,
    removeOnFail: 50,
  };

  const worker = new Worker(queueName, processor, { ...defaultOptions, ...options });

  // Worker event handlers
  worker.on('completed', (job) => {
    logger.info(
      {
        jobId: job.id,
        queue: queueName,
        duration: Date.now() - job.timestamp,
        requestId: job.data?.requestId,
        shopId: job.data?.shopId,
      },
      'Job completed',
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        queue: queueName,
        error: error.message,
        requestId: job?.data?.requestId,
        shopId: job?.data?.shopId,
      },
      'Job failed',
    );
  });

  worker.on('error', (error) => {
    logger.error({ error, queue: queueName }, 'Worker error');
  });

  return worker;
}

/**
 * Health check for Redis connection
 * @returns {Promise<boolean>} Redis health status
 */
export async function checkRedisHealth() {
  try {
    const connection = getRedisConnection();
    await connection.ping();
    return true;
  } catch (error) {
    logger.error({ error }, 'Redis health check failed');
    return false;
  }
}

/**
 * Get queue metrics
 * @param {string} queueName - Queue name
 * @returns {Promise<Object>} Queue metrics
 */
export async function getQueueMetrics(queueName) {
  try {
    const queue = createQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  } catch (error) {
    logger.error({ error, queueName }, 'Failed to get queue metrics');
    return null;
  }
}

/**
 * Enqueue job with standardized data structure
 * @param {string} queueName - Queue name
 * @param {string} jobName - Job name
 * @param {Object} data - Job data
 * @param {Object} options - Job options
 * @returns {Promise<Job>} Enqueued job
 */
export async function enqueueJob(queueName, jobName, data, options = {}) {
  const queue = createQueue(queueName);

  // Add standardized metadata
  const jobData = {
    ...data,
    requestId: data.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    enqueuedAt: new Date().toISOString(),
  };

  return await queue.add(jobName, jobData, options);
}
