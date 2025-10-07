// src/queue/processors/automations.js
// Automation evaluation processor

import { logger } from '../../lib/logger.js';
import { enqueueJob } from '../queues.js';
import { getPrismaClient } from '../../db/prismaClient.js';

const prisma = getPrismaClient();

/**
 * Evaluate automation rules and trigger delivery jobs
 * @param {Object} job - BullMQ job
 * @returns {Promise<void>}
 */
export async function evaluateAutomation(job) {
  const { data } = job;
  const { trigger, shopId, context, originalEvent: _originalEvent, requestId } = data;

  logger.info(
    {
      jobId: job.id,
      trigger,
      shopId,
      requestId,
    },
    'Evaluating automation rules',
  );

  try {
    // Get active automations for this trigger
    const automations = await prisma.automation.findMany({
      where: {
        shopId,
        trigger,
        isActive: true,
      },
      include: {
        rules: true,
      },
    });

    if (automations.length === 0) {
      logger.info({ trigger, shopId }, 'No active automations found for trigger');
      return;
    }

    // Evaluate each automation
    for (const automation of automations) {
      const shouldTrigger = await evaluateAutomationRules(automation, context, shopId);

      if (shouldTrigger) {
        logger.info(
          {
            automationId: automation.id,
            trigger,
            shopId,
            requestId,
          },
          'Automation triggered, enqueueing delivery job',
        );

        // Enqueue delivery job with rendered template
        await enqueueJob('delivery', 'send', {
          automationId: automation.id,
          shopId,
          trigger,
          context,
          template: automation.template,
          recipient: context.customer_phone || context.customer_email,
          requestId,
        });
      }
    }
  } catch (error) {
    logger.error(
      {
        error: error.message,
        jobId: job.id,
        trigger,
        shopId,
        requestId,
      },
      'Failed to evaluate automation',
    );
    throw error;
  }
}

/**
 * Evaluate automation rules against context
 * @param {Object} automation - Automation configuration
 * @param {Object} context - Event context
 * @param {string} shopId - Shop ID
 * @returns {Promise<boolean>} Whether automation should trigger
 */
async function evaluateAutomationRules(automation, context, shopId) {
  try {
    // Check consent gate
    if (!(await checkConsentGate(context, shopId))) {
      logger.info(
        { automationId: automation.id, shopId },
        'Consent gate failed, skipping automation',
      );
      return false;
    }

    // Check quiet hours
    if (!checkQuietHours(automation.quietHours, context)) {
      logger.info(
        { automationId: automation.id, shopId },
        'Quiet hours active, skipping automation',
      );
      return false;
    }

    // Check frequency caps
    if (!(await checkFrequencyCaps(automation.id, context, shopId))) {
      logger.info(
        { automationId: automation.id, shopId },
        'Frequency cap exceeded, skipping automation',
      );
      return false;
    }

    // Evaluate custom rules
    if (automation.rules && automation.rules.length > 0) {
      for (const rule of automation.rules) {
        if (!evaluateRule(rule, context)) {
          logger.info(
            { automationId: automation.id, ruleId: rule.id, shopId },
            'Rule evaluation failed, skipping automation',
          );
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    logger.error(
      {
        error: error.message,
        automationId: automation.id,
        shopId,
      },
      'Failed to evaluate automation rules',
    );
    return false;
  }
}

/**
 * Check consent gate
 * @param {Object} context - Event context
 * @param {string} shopId - Shop ID
 * @returns {Promise<boolean>} Consent status
 */
async function checkConsentGate(context, shopId) {
  try {
    if (!context.customer_phone) {
      return false; // No phone number, no SMS consent
    }

    // Check if customer has opted in
    const contact = await prisma.contact.findUnique({
      where: {
        shopId_phoneE164: {
          shopId,
          phoneE164: context.customer_phone,
        },
      },
    });

    return contact && !contact.optedOut;
  } catch (error) {
    logger.error({ error: error.message, shopId }, 'Failed to check consent gate');
    return false;
  }
}

/**
 * Check quiet hours
 * @param {Object} quietHours - Quiet hours configuration
 * @param {Object} context - Event context
 * @returns {boolean} Whether outside quiet hours
 */
function checkQuietHours(quietHours, _context) {
  if (!quietHours || !quietHours.enabled) {
    return true;
  }

  const now = new Date();
  const currentHour = now.getHours();

  return currentHour < quietHours.startHour || currentHour > quietHours.endHour;
}

/**
 * Check frequency caps
 * @param {string} automationId - Automation ID
 * @param {Object} context - Event context
 * @param {string} shopId - Shop ID
 * @returns {Promise<boolean>} Whether within frequency limits
 */
async function checkFrequencyCaps(automationId, _context, shopId) {
  try {
    // Check recent messages for this automation
    const recentMessages = await prisma.message.count({
      where: {
        shopId,
        automationId,
        sentAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
    });

    // Simple frequency cap: max 1 message per day per automation
    return recentMessages < 1;
  } catch (error) {
    logger.error({ error: error.message, automationId, shopId }, 'Failed to check frequency caps');
    return false;
  }
}

/**
 * Evaluate a single rule
 * @param {Object} rule - Rule configuration
 * @param {Object} context - Event context
 * @returns {boolean} Rule evaluation result
 */
function evaluateRule(rule, context) {
  try {
    // Simple rule evaluation - can be extended with DSL
    switch (rule.type) {
      case 'order_total_gte':
        return parseFloat(context.order_total || 0) >= parseFloat(rule.value);

      case 'customer_segment':
        return context.customer_segment === rule.value;

      case 'product_tag':
        return context.product_tags?.includes(rule.value);

      default:
        logger.warn({ ruleType: rule.type }, 'Unknown rule type');
        return true;
    }
  } catch (error) {
    logger.error({ error: error.message, ruleId: rule.id }, 'Failed to evaluate rule');
    return false;
  }
}
