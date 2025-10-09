// src/queue/worker.js
// BullMQ worker orchestration

import { createWorker, checkRedisHealth } from './queues.js';
import { processEvent } from './processors/events.js';
import { evaluateAutomation } from './processors/automations.js';
import { processCampaignBatch } from './processors/campaigns.js';
import { processDelivery } from './processors/delivery.js';
import { processHousekeeping } from './processors/housekeeping.js';
import { processDiscountReservation, processDiscountCodeAssignment, processDiscountCodeRelease } from './processors/discount-reservation.js';
import { logger } from '../lib/logger.js';

// Initialize workers
const workers = [];

/**
 * Start all workers
 */
export async function startWorkers() {
  // Check if Redis is configured
  const queueDriver = process.env.QUEUE_DRIVER || 'memory';

  if (queueDriver !== 'redis') {
    logger.info({ queueDriver }, 'Queue driver is not Redis, skipping BullMQ workers');
    return;
  }

  logger.info('Starting BullMQ workers...');

  // Check Redis connectivity before starting workers
  const redisHealthy = await checkRedisHealth();
  if (!redisHealthy) {
    logger.error('Redis is not available, cannot start BullMQ workers');
    throw new Error('Redis connection failed');
  }

  try {
    // Events queue worker
    const eventsWorker = createWorker('events', async (job) => {
      await processEvent(job);
    });
    workers.push(eventsWorker);

    // Automations queue worker
    const automationsWorker = createWorker('automations', async (job) => {
      await evaluateAutomation(job);
    });
    workers.push(automationsWorker);

    // Campaigns queue worker
    const campaignsWorker = createWorker('campaigns', async (job) => {
      await processCampaignBatch(job);
    });
    workers.push(campaignsWorker);

    // Delivery queue worker
    const deliveryWorker = createWorker('delivery', async (job) => {
      await processDelivery(job);
    });
    workers.push(deliveryWorker);

    // Housekeeping queue worker
    const housekeepingWorker = createWorker('housekeeping', async (job) => {
      await processHousekeeping(job);
    });
    workers.push(housekeepingWorker);

    // Discount reservation queue worker
    const discountReservationWorker = createWorker('discount-reservation', async (job) => {
      const { type } = job.payload;
      switch (type) {
        case 'reserve':
          await processDiscountReservation(job);
          break;
        case 'assign':
          await processDiscountCodeAssignment(job);
          break;
        case 'release':
          await processDiscountCodeRelease(job);
          break;
        default:
          logger.error({ type }, 'Unknown discount reservation job type');
          throw new Error(`Unknown job type: ${type}`);
      }
    });
    workers.push(discountReservationWorker);

    logger.info({ workerCount: workers.length }, 'All workers started successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to start workers');
    throw error;
  }
}

/**
 * Stop all workers gracefully
 */
export async function stopWorkers() {
  logger.info('Stopping workers...');

  try {
    await Promise.all(workers.map((worker) => worker.close()));

    logger.info('All workers stopped');
  } catch (error) {
    logger.error({ error }, 'Error stopping workers');
  }
}

/**
 * Get worker status
 * @returns {Object} Worker status information
 */
export function getWorkerStatus() {
  return {
    workerCount: workers.length,
    workers: workers.map((worker) => ({
      name: worker.name,
      isRunning: worker.isRunning(),
    })),
  };
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down workers...');
  await stopWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down workers...');
  await stopWorkers();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  process.exit(1);
});
