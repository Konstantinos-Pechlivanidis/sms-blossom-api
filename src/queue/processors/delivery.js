// src/queue/processors/delivery.js
// Message delivery processor with Mitto integration

import { logger } from '../../lib/logger.js';
import { renderTemplate } from '../../services/templates.js';
import { getPrismaClient } from '../../db/prismaClient.js';
import { sendSms, mapErrorToStatus } from '../../providers/mitto.js';
import {
  incrementSmsSendAttempts,
  incrementSmsSendErrors,
  incrementSmsDeliverySuccess,
  recordQueueJobDuration,
} from '../../lib/metrics.js';

const prisma = getPrismaClient();

/**
 * Process message delivery
 * @param {Object} job - BullMQ job
 * @returns {Promise<void>}
 */
export async function processDelivery(job) {
  const startTime = Date.now();
  const { data } = job;
  const { shopId, recipient, template, context, automationId, campaignId, contactId, requestId } =
    data;

  logger.info(
    {
      jobId: job.id,
      shopId,
      recipient,
      automationId,
      campaignId,
      requestId,
    },
    'Processing message delivery',
  );

  // Record job start
  incrementSmsSendAttempts('queued');

  try {
    // Render template with context
    const renderResult = await renderTemplate({
      body: template,
      vars: context,
    });

    if (renderResult.warnings.length > 0) {
      logger.warn(
        {
          warnings: renderResult.warnings,
          shopId,
          requestId,
        },
        'Template rendering warnings',
      );
    }

    // Create message record
    const message = await prisma.message.create({
      data: {
        shopId,
        contactId,
        automationId,
        campaignId,
        body: renderResult.text,
        provider: 'mitto',
        status: 'queued',
        metadata: {
          warnings: renderResult.warnings,
          requestId,
          renderedAt: new Date().toISOString(),
        },
      },
    });

    try {
      // Send SMS via Mitto
      const mittoResponse = await sendSms({
        to: recipient,
        text: renderResult.text,
        meta: {
          messageId: message.id,
          shopId,
          automationId,
          campaignId,
          contactId,
        },
        callback_url: process.env.MITTO_CALLBACK_URL,
        requestId,
      });

      // Update message with provider response
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          metadata: {
            ...message.metadata,
            provider_msg_id: mittoResponse.provider_msg_id,
            provider_status: mittoResponse.status,
            sentAt: new Date().toISOString(),
          },
        },
      });

      logger.info(
        {
          messageId: message.id,
          provider_msg_id: mittoResponse.provider_msg_id,
          recipient,
          shopId,
          requestId,
        },
        'SMS sent successfully via Mitto',
      );

      // Record success metrics
      incrementSmsSendAttempts('sent');
      incrementSmsDeliverySuccess('mitto');
    } catch (error) {
      // Map error to message status
      const status = mapErrorToStatus(error);

      await prisma.message.update({
        where: { id: message.id },
        data: {
          status,
          failedAt: status === 'failed' ? new Date() : null,
          metadata: {
            ...message.metadata,
            error: error.message,
            errorType: error.isTransient ? 'transient' : 'permanent',
            failedAt: status === 'failed' ? new Date().toISOString() : null,
          },
        },
      });

      logger.error(
        {
          messageId: message.id,
          error: error.message,
          status,
          isTransient: error.isTransient,
          shopId,
          requestId,
        },
        'SMS send failed via Mitto',
      );

      // Record error metrics
      incrementSmsSendErrors(error.isTransient ? 'transient' : 'permanent');
      incrementSmsSendAttempts(status);

      // Re-throw transient errors for retry
      if (error.isTransient) {
        throw error;
      }
    }
  } catch (error) {
    logger.error(
      {
        error: error.message,
        jobId: job.id,
        shopId,
        recipient,
        requestId,
      },
      'Failed to process message delivery',
    );

    // Record error metrics
    incrementSmsSendErrors('processing_error');
    throw error;
  } finally {
    // Record job duration
    const duration = Date.now() - startTime;
    recordQueueJobDuration('delivery', duration);
  }
}
