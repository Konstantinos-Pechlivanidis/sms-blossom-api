// src/routes/queue-health.js
// Queue health endpoint for BullMQ monitoring

import { Router } from 'express';
import { getQueue, getRedisConnection } from '../queue/queues.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Get queue counts for a specific queue
async function getQueueCounts(queueName) {
  try {
    const queue = getQueue(queueName);
    if (!queue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting().then((jobs) => jobs.length),
      queue.getActive().then((jobs) => jobs.length),
      queue.getCompleted().then((jobs) => jobs.length),
      queue.getFailed().then((jobs) => jobs.length),
      queue.getDelayed().then((jobs) => jobs.length),
    ]);

    return { waiting, active, completed, failed, delayed };
  } catch (error) {
    logger.warn({ queue: queueName, error: error.message }, 'Failed to get queue counts');
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }
}

// Get DLQ (Dead Letter Queue) counts
async function getDlqCounts() {
  try {
    // For now, we'll use failed jobs as DLQ
    const eventsQueue = getQueue('events');
    const deliveryQueue = getQueue('delivery');

    const [eventsFailed, deliveryFailed] = await Promise.all([
      eventsQueue ? eventsQueue.getFailed().then((jobs) => jobs.length) : 0,
      deliveryQueue ? deliveryQueue.getFailed().then((jobs) => jobs.length) : 0,
    ]);

    return {
      events_dead: eventsFailed,
      delivery_dead: deliveryFailed,
    };
  } catch (error) {
    logger.warn({ error: error.message }, 'Failed to get DLQ counts');
    return { events_dead: 0, delivery_dead: 0 };
  }
}

// Check Redis connection
async function checkRedisConnection() {
  try {
    const redis = getRedisConnection();
    if (!redis) {
      return false;
    }

    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    logger.warn({ error: error.message }, 'Redis connection check failed');
    return false;
  }
}

// Main queue health endpoint
router.get('/', async (req, res) => {
  const requestId = req.get('x-request-id') || 'unknown';

  try {
    // Check Redis connection
    const redis = await checkRedisConnection();

    if (!redis) {
      // If Redis is down, return minimal response
      return res.json({
        redis: false,
        queues: {},
        dlq: { events_dead: 0, delivery_dead: 0 },
        timestamp: new Date().toISOString(),
        request_id: requestId,
      });
    }

    // Get queue counts for all queues
    const queueNames = ['events', 'automations', 'campaigns', 'delivery', 'housekeeping'];
    const queueCounts = {};

    for (const queueName of queueNames) {
      queueCounts[queueName] = await getQueueCounts(queueName);
    }

    // Get DLQ counts
    const dlq = await getDlqCounts();

    const response = {
      redis: true,
      queues: queueCounts,
      dlq,
      timestamp: new Date().toISOString(),
      request_id: requestId,
    };

    logger.info({ request_id: requestId, ...response }, 'Queue health check completed');
    res.json(response);
  } catch (error) {
    logger.error({ error: error.message, request_id: requestId }, 'Queue health check failed');

    // Return graceful error response
    res.json({
      redis: false,
      queues: {},
      dlq: { events_dead: 0, delivery_dead: 0 },
      error: 'Queue health check failed',
      timestamp: new Date().toISOString(),
      request_id: requestId,
    });
  }
});

// Queue metrics endpoint (for monitoring)
router.get('/metrics', async (req, res) => {
  const requestId = req.get('x-request-id') || 'unknown';

  try {
    const redis = await checkRedisConnection();

    if (!redis) {
      return res.status(503).json({
        error: 'Redis not available',
        request_id: requestId,
      });
    }

    const queueNames = ['events', 'automations', 'campaigns', 'delivery', 'housekeeping'];
    const metrics = [];

    for (const queueName of queueNames) {
      const counts = await getQueueCounts(queueName);
      metrics.push({
        queue: queueName,
        ...counts,
      });
    }

    res.json({
      metrics,
      timestamp: new Date().toISOString(),
      request_id: requestId,
    });
  } catch (error) {
    logger.error({ error: error.message, request_id: requestId }, 'Queue metrics failed');
    res.status(500).json({
      error: 'Queue metrics failed',
      request_id: requestId,
    });
  }
});

export default router;
