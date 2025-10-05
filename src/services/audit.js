// src/services/audit.js
// Audit service for logging events with minimal PII

import { getPrismaClient } from '../db/prismaClient.js';

const prisma = getPrismaClient();

/**
 * Append an audit event. Keep PII minimal.
 */
export async function logAudit({
  shopId,
  actor = 'system',
  action,
  entity,
  entityId = null,
  ip = null,
  ua = null,
  diff = null,
}) {
  try {
    await prisma.auditLog.create({
      data: {
        shopId,
        actor,
        action,
        entity,
        entityId,
        ip: ip || null,
        ua: ua || null,
        diffJson: diff || {},
      },
    });
  } catch (e) {
    // never crash a request for audit errors
    console.error('[audit] failed to log event:', e?.message || e);
  }
}
