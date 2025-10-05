import { QueueAdapter } from './adapter.js';
import { nowMs, minutes } from '../lib/time.js';
import { logger } from '../lib/logger.js';

const DEDUPE_TTL_MS = minutes(5);

export class MemoryQueue extends QueueAdapter {
  constructor() {
    super();
    this.queue = [];
    this.processing = false;
    this.recentKeys = new Map(); // key -> expiresAt
    this.scheduler = {
      // no-op stub for phase 1
      async repeat() {},
    };
  }

  async enqueue(queueName, jobName, data) {
    const key = data && data.dedupeKey ? String(data.dedupeKey) : undefined;
    if (key) {
      const expiresAt = this.recentKeys.get(key);
      if (expiresAt && expiresAt > nowMs()) {
        logger.debug({ key }, 'memory queue short-circuit duplicate');
        return { skipped: true };
      }
      this.recentKeys.set(key, nowMs() + DEDUPE_TTL_MS);
    }

    this.queue.push({ queueName, jobName, data });
    this.#drainSoon();
    return { enqueued: true };
  }

  #drainSoon() {
    if (this.processing) return;
    this.processing = true;
    setImmediate(async () => {
      try {
        while (this.queue.length > 0) {
          const job = this.queue.shift();
          logger.debug({ job }, 'processing memory job');
          // Placeholder: in phase 2, dispatch to processors
        }
      } finally {
        this.processing = false;
      }
    });
  }
}

let memoryQueueSingleton;
export function getQueue() {
  if (!memoryQueueSingleton) memoryQueueSingleton = new MemoryQueue();
  return memoryQueueSingleton;
}
