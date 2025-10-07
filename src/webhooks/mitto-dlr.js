// src/webhooks/mitto-dlr.js
// Mitto Delivery Receipt (DLR) webhook handler

import { Router } from 'express';
import crypto from 'crypto';
import { logger } from '../lib/logger.js';
import { getPrismaClient } from '../db/prismaClient.js';

const router = Router();
const prisma = getPrismaClient();

/**
 * Verify Mitto webhook HMAC signature
 */
function verifyHmac(payload, signature, secret) {
  if (!secret) {
    logger.warn('MITTO_HMAC_SECRET not configured, skipping HMAC verification');
    return true;
  }

  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex'),
  );
}

/**
 * Handle Mitto DLR webhook
 * POST /webhooks/mitto/dlr
 */
router.post('/dlr', async (req, res) => {
  const rawBody = JSON.stringify(req.body);
  const signature = req.get('X-Mitto-Signature') || req.get('X-Hub-Signature-256');

  logger.info(
    {
      signature: signature ? 'present' : 'missing',
      body: req.body,
    },
    'Received Mitto DLR webhook',
  );

  // Verify HMAC if configured
  if (process.env.MITTO_HMAC_SECRET && signature) {
    const isValid = verifyHmac(rawBody, signature, process.env.MITTO_HMAC_SECRET);
    if (!isValid) {
      logger.warn('Invalid HMAC signature for Mitto DLR webhook');
      return res.status(401).json({ error: 'invalid_signature' });
    }
  }

  try {
    const { message_id, status, error_code, error_message, delivered_at, failed_at } = req.body;

    if (!message_id) {
      logger.warn('Missing message_id in DLR webhook');
      return res.status(400).json({ error: 'missing_message_id' });
    }

    // Find message by provider_msg_id
    const message = await prisma.message.findFirst({
      where: {
        metadata: {
          path: ['provider_msg_id'],
          equals: message_id,
        },
      },
    });

    if (!message) {
      logger.warn({ message_id, status }, 'Message not found for DLR webhook');
      return res.status(404).json({ error: 'message_not_found' });
    }

    // Update message status based on DLR
    const updateData = {
      metadata: {
        ...message.metadata,
        dlr_received_at: new Date().toISOString(),
        dlr_status: status,
        dlr_error_code: error_code,
        dlr_error_message: error_message,
      },
    };

    if (status === 'delivered') {
      updateData.status = 'delivered';
      updateData.deliveredAt = delivered_at ? new Date(delivered_at) : new Date();
    } else if (status === 'failed' || status === 'undelivered') {
      updateData.status = 'failed';
      updateData.failedAt = failed_at ? new Date(failed_at) : new Date();
    }

    await prisma.message.update({
      where: { id: message.id },
      data: updateData,
    });

    logger.info(
      {
        messageId: message.id,
        provider_msg_id: message_id,
        status,
        error_code,
        shopId: message.shopId,
      },
      'Message status updated from DLR',
    );

    res.json({ ok: true, messageId: message.id });
  } catch (error) {
    logger.error(
      {
        error: error.message,
        body: req.body,
      },
      'Failed to process DLR webhook',
    );

    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
