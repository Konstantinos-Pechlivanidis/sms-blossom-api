// src/services/scheduler.js
// Persistent scheduler service for abandoned checkout jobs

import { getPrismaClient } from '../db/prismaClient.js';
import { renderGateQueueAndSend } from './messages.js';
import { logAudit } from './audit.js';
import { denormalizeContactAges } from './contacts-denormalize.js';

const prisma = getPrismaClient();

export async function upsertAbandonedCheckoutJob({
  shop,
  contact,
  phoneE164,
  checkoutId,
  runAt, // Date
  recoveryUrl, // string
}) {
  const dedupeKey = `abandoned:${shop.id}:${checkoutId}`;
  const payload = {
    triggerKey: 'abandoned_checkout',
    checkoutId,
    contactId: contact.id,
    phoneE164,
    recoveryUrl,
  };
  // Upsert by dedupeKey: snooze (reset inactivity window)
  const existing = await prisma.job.findUnique({ where: { dedupeKey } }).catch(() => null);
  if (existing && existing.status === 'pending') {
    await prisma.job.update({
      where: { id: existing.id },
      data: { runAt, payload },
    });
    return existing.id;
  }
  const row = await prisma.job.create({
    data: {
      shopId: shop.id,
      type: 'abandoned_checkout',
      status: 'pending',
      runAt,
      payload,
      dedupeKey,
    },
  });
  return row.id;
}

export async function cancelAbandonedCheckoutJobs({ shopId, checkoutId }) {
  const dedupeKey = `abandoned:${shopId}:${checkoutId}`;
  const job = await prisma.job.findUnique({ where: { dedupeKey } }).catch(() => null);
  if (!job) return false;
  if (job.status !== 'pending') return false;
  await prisma.job.update({ where: { id: job.id }, data: { status: 'canceled' } });
  return true;
}

// Generic job scheduler for GDPR and other job types
export async function scheduleJob({ shopId, kind, key, runAt, payload }) {
  const dedupeKey = key;

  // Check if job already exists and is pending
  const existing = await prisma.job.findUnique({ where: { dedupeKey } }).catch(() => null);
  if (existing && existing.status === 'pending') {
    await prisma.job.update({
      where: { id: existing.id },
      data: { runAt, payload },
    });
    return existing.id;
  }

  // Create new job
  const row = await prisma.job.create({
    data: {
      shopId,
      type: kind,
      status: 'pending',
      runAt,
      payload,
      dedupeKey,
    },
  });
  return row.id;
}

async function executeAbandonedJob(job) {
  const { shopId, payload } = job;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new Error('shop_missing');

  const contact = await prisma.contact.findUnique({ where: { id: payload.contactId } });
  if (!contact) throw new Error('contact_missing');

  // Final guard & send
  const result = await renderGateQueueAndSend({
    shop,
    contact,
    phoneE164: payload.phoneE164,
    templateKey: 'abandoned_checkout',
    vars: { checkout: { id: payload.checkoutId, recovery_url: payload.recoveryUrl } },
    triggerKey: 'abandoned_checkout',
    dedupeKey: String(payload.checkoutId),
    metadata: {
      type: 'abandoned_checkout',
      checkoutId: payload.checkoutId,
      recoveryUrl: payload.recoveryUrl,
    },
  });

  // mark job
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: result.sent ? 'done' : 'canceled',
      attempts: { increment: 1 },
      lastError: result.sent ? null : result.reason || null,
    },
  });

  await logAudit({
    shopId,
    actor: 'system',
    action: 'automation.abandoned_checkout.executed',
    entity: 'job',
    entityId: job.id,
    diff: { result, payload },
  });
}

async function executeGDPRCustomerRedactJob(job) {
  const { shopId, payload } = job;

  // Import GDPR service functions
  const { redactCustomer } = await import('./gdpr.js');

  await redactCustomer({
    shopId: payload.shopId,
    customerId: payload.customerId,
    email: payload.email,
    phone: payload.phone,
  });

  // Mark job as done
  await prisma.job.update({
    where: { id: job.id },
    data: { status: 'done', attempts: { increment: 1 } },
  });

  await logAudit({
    shopId,
    actor: 'system',
    action: 'gdpr.customer_redact.executed',
    entity: 'job',
    entityId: job.id,
    diff: { payload },
  });
}

async function executeGDPRShopRedactJob(job) {
  const { shopId, payload } = job;

  // Import GDPR service functions
  const { purgeShop } = await import('./gdpr.js');

  await purgeShop({ shopId: payload.shopId });

  // Mark job as done
  await prisma.job.update({
    where: { id: job.id },
    data: { status: 'done', attempts: { increment: 1 } },
  });

  await logAudit({
    shopId,
    actor: 'system',
    action: 'gdpr.shop_redact.executed',
    entity: 'job',
    entityId: job.id,
    diff: { payload },
  });
}

/**
 * Poller: checks for due pending jobs every N seconds and runs them.
 * Simple concurrency gate; fail-safe (doesn't crash server).
 */
let _timer = null;
export function startScheduler({ intervalMs = 15000 } = {}) {
  if (_timer) return;
  _timer = setInterval(async () => {
    try {
      const now = new Date();
      // claim a small batch of due jobs
      const due = await prisma.job.findMany({
        where: { status: 'pending', runAt: { lte: now } },
        orderBy: { runAt: 'asc' },
        take: 10,
      });
      for (const job of due) {
        // double-check & mark running
        const locked = await prisma.job
          .update({
            where: { id: job.id },
            data: { status: 'running', attempts: { increment: 1 } },
          })
          .catch(() => null);
        if (!locked) continue;

        try {
          if (job.type === 'abandoned_checkout') {
            await executeAbandonedJob(job);
          } else if (job.type === 'gdpr_customer_redact') {
            await executeGDPRCustomerRedactJob(job);
          } else if (job.type === 'gdpr_shop_redact') {
            await executeGDPRShopRedactJob(job);
          } else if (job.type === 'contacts:denormalize:age') {
            await executeContactsDenormalizeAgeJob(job);
          } else {
            // unknown job type → cancel
            await prisma.job.update({
              where: { id: job.id },
              data: { status: 'canceled', lastError: 'unknown_type' },
            });
          }
        } catch (e) {
          await prisma.job.update({
            where: { id: job.id },
            data: { status: 'failed', lastError: String(e?.message || e) },
          });
        }
      }
    } catch {
      // swallow scheduler errors
    }
  }, intervalMs);
}

/**
 * Boot function for scheduler initialization
 * Called during server startup to set up the scheduler
 */
export async function schedulerBoot() {
  // Initialize any required scheduler state
  // This could include checking for stuck jobs, cleaning up old jobs, etc.

  // Clean up any stuck jobs that might be in 'running' state from previous runs
  const stuckJobs = await prisma.job.findMany({
    where: { status: 'running' },
  });

  if (stuckJobs.length > 0) {
    await prisma.job.updateMany({
      where: { status: 'running' },
      data: { status: 'pending' },
    });
  }

  // Clean up old completed/failed jobs (optional - keep for debugging)
  const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  await prisma.job.deleteMany({
    where: {
      status: { in: ['done', 'canceled', 'failed'] },
      runAt: { lt: cutoffDate },
    },
  });
}

/**
 * Execute contacts age denormalization job
 */
async function executeContactsDenormalizeAgeJob(job) {
  const { shopId, batchSize = 1000 } = job.payload;
  
  try {
    const result = await denormalizeContactAges({ shopId, batchSize });
    
    await prisma.job.update({
      where: { id: job.id },
      data: { 
        status: 'done',
        payload: { ...job.payload, result }
      },
    });
  } catch (error) {
    await prisma.job.update({
      where: { id: job.id },
      data: { 
        status: 'failed', 
        lastError: String(error?.message || error) 
      },
    });
    throw error;
  }
}
