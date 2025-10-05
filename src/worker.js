// src/worker.js
// Separate worker process for BullMQ/Redis queues

import { Worker } from 'bullmq';
import { getRedisConnection } from './queue/driver.js';
import { dispatchEvent } from './queue/dispatcher.js';
import { getPrismaClient } from './db/prismaClient.js';

const redis = getRedisConnection();
if (!redis) {
  console.error('[worker] QUEUE_DRIVER is not redis or REDIS_URL missing. Exiting.');
  process.exit(1);
}

const prisma = getPrismaClient();

const eventsConcurrency = Number(process.env.WORKER_EVENTS_CONCURRENCY || 10);
const jobsConcurrency = Number(process.env.WORKER_JOBS_CONCURRENCY || 10);

new Worker(
  'events',
  async (job) => {
    const { topic, shopDomain, shopId, payload, eventId } = job.data || {};
    try {
      await dispatchEvent({ topic, shopDomain, shopId, payload });
      if (eventId)
        await prisma.event.update({ where: { id: eventId }, data: { processedAt: new Date() } });
    } catch (e) {
      if (eventId)
        await prisma.event.update({
          where: { id: eventId },
          data: { error: String(e?.message || e) },
        });
      throw e;
    }
  },
  { connection: redis, concurrency: eventsConcurrency },
);

new Worker(
  'jobs',
  async (job) => {
    const key = job?.data?.key;
    if (!key) return;
    // Re-use scheduler run code by dynamic import
    const mod = await import('./services/scheduler.js');
    await mod.runJob(key);
  },
  { connection: redis, concurrency: jobsConcurrency },
);

console.log('[worker] Workers started (events, jobs)');
