// src/queue/driver.js
// Queue driver with Redis/memory fallback

import { Queue } from 'bullmq';
import IORedis from 'ioredis';

let redisConn = null;
const DRIVER = (process.env.QUEUE_DRIVER || 'memory').toLowerCase();

export function isRedis() {
  return DRIVER === 'redis' && !!process.env.REDIS_URL;
}

export function getRedisConnection() {
  if (!isRedis()) return null;
  if (!redisConn) {
    redisConn = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return redisConn;
}

// Queues (lazy)
let qEvents = null;
let qJobs = null;

export function getEventsQueue() {
  if (!isRedis()) return null;
  if (!qEvents) qEvents = new Queue('events', { connection: getRedisConnection() });
  return qEvents;
}

export function getJobsQueue() {
  if (!isRedis()) return null;
  if (!qJobs) qJobs = new Queue('jobs', { connection: getRedisConnection() });
  return qJobs;
}

// Adders
export async function enqueueEvent(payload, opts = {}) {
  const q = getEventsQueue();
  if (!q) return null;
  const jobOpts = {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
    ...opts,
  };
  return q.add('event', payload, jobOpts);
}

export async function enqueueJobRunner(key, opts = {}) {
  const q = getJobsQueue();
  if (!q) return null;
  const jobOpts = {
    jobId: key,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    ...opts,
  };
  return q.add('run', { key }, jobOpts);
}
