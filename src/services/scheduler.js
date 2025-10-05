// src/services/scheduler.js
// Persistent scheduler service for abandoned checkout jobs

import { getPrismaClient } from '../db/prismaClient.js';
import { renderGateQueueAndSend } from './messages.js';
import { logAudit } from './audit.js';

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
