// src/routes/queue-health.js
// Queue health and metrics endpoint

import { Router } from 'express';
import { checkRedisHealth, getQueueMetrics } from '../queue/queues.js';
import { getWorkerStatus } from '../queue/worker.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * Queue health check
 * GET /queue/health
 */
router.get('/health', async (req, res) => {
  try {
    const queueDriver = process.env.QUEUE_DRIVER || 'memory';

    // If not using Redis, return appropriate status
    if (queueDriver !== 'redis') {
      return res.json({
        redis: false,
        workers: { workerCount: 0, workers: [] },
        queues: {},
        queueDriver,
        message: 'Queue driver is not Redis - BullMQ workers not started',
        timestamp: new Date().toISOString(),
      });
    }

    const redisHealthy = await checkRedisHealth();
    const workerStatus = getWorkerStatus();

    const queueNames = ['events', 'automations', 'campaigns', 'delivery', 'housekeeping'];
    const queueMetrics = {};

    // Get metrics for each queue
    for (const queueName of queueNames) {
      const metrics = await getQueueMetrics(queueName);
      if (metrics) {
        queueMetrics[queueName] = metrics;
      }
    }

    const health = {
      redis: redisHealthy,
      workers: workerStatus,
      queues: queueMetrics,
      timestamp: new Date().toISOString(),
    };

    const statusCode = redisHealthy ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    logger.error({ error }, 'Queue health check failed');
    res.status(500).json({
      error: 'Queue health check failed',
      details: error.message,
    });
  }
});

/**
 * Queue metrics
 * GET /queue/metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const queueNames = ['events', 'automations', 'campaigns', 'delivery', 'housekeeping'];
    const metrics = {};

    for (const queueName of queueNames) {
      const queueMetrics = await getQueueMetrics(queueName);
      if (queueMetrics) {
        metrics[queueName] = queueMetrics;
      }
    }

    res.json({
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get queue metrics');
    res.status(500).json({
      error: 'Failed to get queue metrics',
      details: error.message,
    });
  }
});

export default router;
