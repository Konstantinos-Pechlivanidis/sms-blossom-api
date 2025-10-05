// src/services/gdpr.js
// GDPR compliance service with data request, redaction, and audit logging

import { getPrismaClient } from '../db/prismaClient.js';
import { scheduleJob } from './scheduler.js';
import { sha256Hex } from '../lib/crypto.js';

const prisma = getPrismaClient();

// Retention windows (configurable later via settings if desired)
const CUSTOMER_REDACT_DELAY_HOURS = 12; // grace period
const SHOP_REDACT_DELAY_HOURS = 24 * 10; // 10 days (Shopify guidance)

// Utils
async function log(shopId, action, subject, meta) {
  try {
    await prisma.auditLog.create({
      data: { shopId: shopId || null, action, subject: subject || null, meta: meta || {} },
    });
  } catch {}
}

// Public API (called from webhook processors/dispatcher)
export async function handleCustomerDataRequest({ shopId, payload }) {
  const customer = payload?.customer || {};
  const subject = customer?.id || customer?.email || customer?.phone || 'unknown';
  await log(shopId, 'gdpr.data_request', String(subject), payload || {});
  // No sync export needed here; we only ack and record the request. Admin UI can read AuditLog.
}

export async function handleCustomerRedact({ shopId, payload }) {
  const customer = payload?.customer || {};
  const subject = customer?.id || customer?.email || customer?.phone || 'unknown';
  await log(shopId, 'gdpr.customer_redact', String(subject), payload || {});

  const key = `gdpr:cust:${shopId}:${sha256Hex(subject)}`;
  const runAt = new Date(Date.now() + CUSTOMER_REDACT_DELAY_HOURS * 3600 * 1000);

  await scheduleJob({
    shopId,
    kind: 'gdpr_customer_redact',
    key,
    runAt,
    payload: {
      shopId,
      customerId: String(customer?.id || ''),
      email: customer?.email || null,
      phone: customer?.phone || null,
    },
  });
}

export async function handleShopRedact({ shopId, payload }) {
  const shopDomain = payload?.shop_domain || payload?.shop || null;
  await log(shopId, 'gdpr.shop_redact', String(shopDomain || ''), payload || {});

  const key = `gdpr:shop:${shopId}`;
  const runAt = new Date(Date.now() + SHOP_REDACT_DELAY_HOURS * 3600 * 1000);

  await scheduleJob({
    shopId,
    kind: 'gdpr_shop_redact',
    key,
    runAt,
    payload: { shopId },
  });
}

// Redaction routines (called by workers)
export async function redactCustomer({ shopId, customerId, email, phone }) {
  // Try to match by customerId first, then by email/phone
  const where = customerId
    ? { shopId, customerId: String(customerId) }
    : email
      ? { shopId, email }
      : phone
        ? { shopId, phoneE164: phone }
        : null;
  if (!where) return;

  const contacts = await prisma.contact.findMany({ where });
  for (const c of contacts) {
    try {
      // Hash PII and clear direct identifiers
      const maskedEmail = c.email ? `hash:${sha256Hex(c.email)}` : null;
      const maskedPhone = c.phoneE164 ? `hash:${sha256Hex(c.phoneE164)}` : null;

      await prisma.contact.update({
        where: { id: c.id },
        data: {
          customerId: null,
          firstName: null,
          lastName: null,
          email: maskedEmail,
          phoneE164: maskedPhone,
          optedOut: true,
        },
      });

      // Optionally redact Message bodies (we'll keep metadata but drop content)
      await prisma.message.updateMany({
        where: { shopId, contactId: c.id },
        data: { body: '[redacted]' },
      });
    } catch {}
  }
}

export async function purgeShop({ shopId }) {
  // Remove or anonymize all shop data; here we'll hard-delete messages/events/jobs and anonymize contacts
  try {
    await prisma.message.deleteMany({ where: { shopId } });
    await prisma.event.deleteMany({ where: { shopId } });
    await prisma.job.deleteMany({ where: { shopId } });
    await prisma.discount.deleteMany({ where: { shopId } });
    // Contacts → anonymize (keep counts but no PII)
    const contacts = await prisma.contact.findMany({ where: { shopId } });
    for (const c of contacts) {
      await prisma.contact.update({
        where: { id: c.id },
        data: {
          customerId: null,
          firstName: null,
          lastName: null,
          email: c.email ? `hash:${sha256Hex(c.email)}` : null,
          phoneE164: c.phoneE164 ? `hash:${sha256Hex(c.phoneE164)}` : null,
          optedOut: true,
        },
      });
    }
  } catch {}
}
