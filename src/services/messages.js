// src/services/messages.js
// Message creation, sending, and status updates

import { getPrismaClient } from '../db/prismaClient.js';
import { renderTemplate } from './templates.js';
import { sendSms } from './mitto.js';
import { canSend } from './rules.js';

const prisma = getPrismaClient();

/**
 * Persist a message row in 'queued' state.
 */
export async function createQueuedMessage({ shopId, contactId, phoneE164: _phoneE164, body }) {
  return prisma.message.create({
    data: {
      shopId,
      contactId,
      body,
      provider: 'mitto',
      status: 'queued',
      metadata: {},
    },
  });
}

/**
 * Send an SMS via Mitto and update Message row accordingly.
 * We attach our Message.id as 'mid' in the callback_url query so DLR can map without schema changes.
 */
export async function sendAndMark({ messageId, metadata = null }) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) throw new Error('message_not_found');

  // Find contact to get phone
  const contact = msg.contactId
    ? await prisma.contact.findUnique({ where: { id: msg.contactId } })
    : await prisma.contact.findFirst({
        where: { shopId: msg.shopId, phoneE164: msg.metadata?.phoneE164 },
      });

  const to = contact?.phoneE164 || msg.metadata?.phoneE164;
  if (!to) {
    await prisma.message.update({
      where: { id: messageId },
      data: { status: 'failed', metadata: { ...msg.metadata, error: 'missing_destination' } },
    });
    return;
  }

  try {
    const callback = `${process.env.APP_URL.replace(/\/$/, '')}/webhooks/mitto/dlr?mid=${encodeURIComponent(messageId)}`;
    const { providerMsgId } = await sendSms({
      to,
      text: msg.body,
      meta: { mid: messageId },
      callbackUrl: callback,
    });
    await prisma.message.update({
      where: { id: messageId },
      data: { status: 'sent', metadata: { ...msg.metadata, providerMsgId, ...(metadata || {}) } },
    });
  } catch (e) {
    await prisma.message.update({
      where: { id: messageId },
      data: {
        status: 'failed',
        metadata: { ...msg.metadata, error: String(e?.message || e), ...(metadata || {}) },
      },
    });
  }
}

/**
 * Convenience: build body via Liquid, create queued message, then send.
 */
export async function renderQueueAndSend({ shopId, contactId, phoneE164, templateKey, vars }) {
  const body = await renderTemplate(templateKey, vars);
  const queued = await createQueuedMessage({
    shopId,
    contactId: contactId || null,
    phoneE164,
    body,
  });
  // add phone into metadata for fallback
  await prisma.message.update({
    where: { id: queued.id },
    data: { metadata: { ...(queued.metadata || {}), phoneE164 } },
  });
  await sendAndMark({ messageId: queued.id });
  return queued.id;
}

/**
 * Render → gate (rules.canSend) → queue → send.
 * Saves triggerKey & dedupeKey in Message for future caps/dedupe checks.
 */
export async function renderGateQueueAndSend({
  shop,
  contact,
  phoneE164,
  templateKey,
  vars,
  triggerKey,
  dedupeKey = null,
  kind = 'automation',
  metadata = null,
}) {
  const gate = await canSend({ shop, contact, triggerKey, dedupeKey });
  if (!gate.allowed) return { sent: false, reason: gate.reason };

  const body = await renderTemplate(templateKey, vars);
  const queued = await prisma.message.create({
    data: {
      shopId: shop.id,
      contactId: contact.id,
      body,
      provider: 'mitto',
      status: 'queued',
      kind,
      triggerKey,
      metadata: { phoneE164, ...(dedupeKey ? { dedupeKey } : {}), ...(metadata || {}) },
    },
  });
  await sendAndMark({ messageId: queued.id, metadata });
  return { sent: true, messageId: queued.id };
}
