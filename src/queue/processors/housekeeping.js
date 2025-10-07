// src/queue/processors/housekeeping.js
// Housekeeping tasks processor

import { logger } from '../../lib/logger.js';
import { getPrismaClient } from '../../db/prismaClient.js';

const prisma = getPrismaClient();

/**
 * Process housekeeping tasks
 * @param {Object} job - BullMQ job
 * @returns {Promise<void>}
 */
export async function processHousekeeping(job) {
  const { data } = job;
  const { task, shopId, requestId } = data;

  logger.info(
    {
      jobId: job.id,
      task,
      shopId,
      requestId,
    },
    'Processing housekeeping task',
  );

  try {
    switch (task) {
      case 'cleanup_old_messages':
        await cleanupOldMessages(shopId);
        break;

      case 'retry_failed_messages':
        await retryFailedMessages(shopId);
        break;

      case 'rollup_reports':
        await rollupReports(shopId);
        break;

      case 'cleanup_events':
        await cleanupEvents(shopId);
        break;

      default:
        logger.warn({ task }, 'Unknown housekeeping task');
    }

    logger.info({ task, shopId, requestId }, 'Housekeeping task completed');
  } catch (error) {
    logger.error(
      {
        error: error.message,
        jobId: job.id,
        task,
        shopId,
        requestId,
      },
      'Failed to process housekeeping task',
    );
    throw error;
  }
}

/**
 * Clean up old messages
 * @param {string} shopId - Shop ID
 */
async function cleanupOldMessages(shopId) {
  try {
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago

    const deletedCount = await prisma.message.deleteMany({
      where: {
        shopId,
        createdAt: {
          lt: cutoffDate,
        },
        status: {
          in: ['sent', 'delivered', 'failed'],
        },
      },
    });

    logger.info(
      {
        shopId,
        deletedCount: deletedCount.count,
        cutoffDate,
      },
      'Cleaned up old messages',
    );
  } catch (error) {
    logger.error({ error: error.message, shopId }, 'Failed to cleanup old messages');
  }
}

/**
 * Retry failed messages
 * @param {string} shopId - Shop ID
 */
async function retryFailedMessages(shopId) {
  try {
    const failedMessages = await prisma.message.findMany({
      where: {
        shopId,
        status: 'failed',
        failedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      take: 10, // Limit retries
    });

    for (const message of failedMessages) {
      // Reset status for retry
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'queued',
          failedAt: null,
          errorCode: null,
        },
      });

      logger.info({ messageId: message.id, shopId }, 'Reset failed message for retry');
    }

    logger.info(
      {
        shopId,
        retryCount: failedMessages.length,
      },
      'Retried failed messages',
    );
  } catch (error) {
    logger.error({ error: error.message, shopId }, 'Failed to retry failed messages');
  }
}

/**
 * Rollup reports
 * @param {string} shopId - Shop ID
 */
async function rollupReports(shopId) {
  try {
    // Calculate daily message stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const messageStats = await prisma.message.aggregate({
      where: {
        shopId,
        sentAt: {
          gte: today,
        },
      },
      _count: {
        id: true,
      },
    });

    // Store rollup data (simplified)
    logger.info(
      {
        shopId,
        messageCount: messageStats._count.id,
        date: today.toISOString(),
      },
      'Rolled up daily message stats',
    );
  } catch (error) {
    logger.error({ error: error.message, shopId }, 'Failed to rollup reports');
  }
}

/**
 * Clean up old events
 * @param {string} shopId - Shop ID
 */
async function cleanupEvents(shopId) {
  try {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const deletedCount = await prisma.event.deleteMany({
      where: {
        shopId,
        receivedAt: {
          lt: cutoffDate,
        },
      },
    });

    logger.info(
      {
        shopId,
        deletedCount: deletedCount.count,
        cutoffDate,
      },
      'Cleaned up old events',
    );
  } catch (error) {
    logger.error({ error: error.message, shopId }, 'Failed to cleanup old events');
  }
}


