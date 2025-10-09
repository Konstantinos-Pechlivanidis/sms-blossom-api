import { getPrismaClient } from '../../db/prismaClient.js';
import { renderTemplate } from '../../services/templates.js';
import { sendSMS } from '../../services/mitto.js';
import { createLinkBuilder } from '../../services/link-builder.js';
import { logger } from '../../lib/logger.js';

const prisma = getPrismaClient();

/**
 * Process abandoned checkout automation job
 */
export async function processAbandonedCheckoutAutomation(job) {
  const { automationId, checkoutToken, customerId, email, phone, totalPrice, currency, abandonedCheckoutUrl } = job.payload;
  
  try {
    logger.info({
      jobId: job.id,
      automationId,
      checkoutToken,
      customerId,
    }, 'Processing abandoned checkout automation');

    // Get automation configuration
    const automation = await prisma.automation.findUnique({
      where: { id: automationId }
    });

    if (!automation || !automation.enabled) {
      logger.warn({
        automationId,
        enabled: automation?.enabled,
      }, 'Automation not found or disabled');
      return;
    }

    // Get shop information
    const shop = await prisma.shop.findUnique({
      where: { domain: job.shopId }
    });

    if (!shop) {
      logger.error({
        shopId: job.shopId,
      }, 'Shop not found for automation');
      return;
    }

    // Check if customer has opted out
    if (customerId) {
      const contact = await prisma.contact.findFirst({
        where: {
          shopId: job.shopId,
          customerId: customerId.toString(),
        }
      });

      if (contact && contact.optedOut) {
        logger.info({
          customerId,
          contactId: contact.id,
        }, 'Customer has opted out, skipping automation');
        return;
      }
    }

    // Prepare template variables
    const variables = {
      customer: {
        first_name: 'Customer', // We don't have this from checkout
        email: email,
        phone: phone,
      },
      checkout: {
        token: checkoutToken,
        total_price: totalPrice,
        currency: currency,
        abandoned_checkout_url: abandonedCheckoutUrl,
      },
      shop: {
        name: shop.name,
        domain: shop.domain,
      },
    };

    // Render template
    const renderedTemplate = await renderTemplate({
      template: automation.template,
      variables,
      trigger: 'abandoned_checkout',
    });

    if (!renderedTemplate.success) {
      logger.error({
        automationId,
        template: automation.template,
        errors: renderedTemplate.errors,
      }, 'Failed to render automation template');
      return;
    }

    // Check if we have a phone number to send to
    if (!phone) {
      logger.warn({
        automationId,
        checkoutToken,
      }, 'No phone number available for abandoned checkout automation');
      return;
    }

    // Create or get contact
    let contact = await prisma.contact.findFirst({
      where: {
        shopId: job.shopId,
        phoneE164: phone,
      }
    });

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          shopId: job.shopId,
          customerId: customerId?.toString(),
          phoneE164: phone,
          email: email,
          smsConsentState: 'opted_in', // Assume consent for abandoned checkout
          smsConsentSource: 'abandoned_checkout',
          smsConsentAt: new Date(),
        }
      });
    }

    // Check consent again after creating contact
    if (contact.optedOut) {
      logger.info({
        contactId: contact.id,
      }, 'Contact has opted out, skipping automation');
      return;
    }

    // Create discount link if configured
    let discountUrl = null;
    let shortlink = null;
    
    if (automation.discountConfig) {
      const linkBuilder = createLinkBuilder(shop.domain);
      
      if (automation.discountConfig.mode === 'shared' && automation.discountConfig.discountId) {
        const discount = await prisma.discount.findFirst({
          where: {
            id: automation.discountConfig.discountId,
            shopId: job.shopId,
          }
        });

        if (discount) {
          discountUrl = linkBuilder.buildDiscountUrl(
            discount.code,
            automation.discountConfig.redirectPath || '/checkout',
            automation.discountConfig.utmJson || {}
          );

          // Create shortlink
          const shortlinkData = await linkBuilder.createShortlink(
            discountUrl,
            null, // No campaign ID for automation
            {
              automationId: automation.id,
              contactId: contact.id,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            }
          );

          shortlink = {
            slug: shortlinkData.slug,
            shortUrl: shortlinkData.shortUrl,
          };
        }
      }
    }

    // Send SMS
    const smsResult = await sendSMS({
      to: phone,
      message: renderedTemplate.text,
      shopId: job.shopId,
    });

    if (!smsResult.success) {
      logger.error({
        automationId,
        contactId: contact.id,
        phone,
        error: smsResult.error,
      }, 'Failed to send automation SMS');
      return;
    }

    // Create message record
    const message = await prisma.message.create({
      data: {
        shopId: job.shopId,
        contactId: contact.id,
        body: renderedTemplate.text,
        provider: 'mitto',
        status: 'sent',
        kind: 'automation',
        triggerKey: 'abandoned_checkout',
        sentAt: new Date(),
        discountCodeId: automation.discountConfig?.discountId,
        shortlinkId: shortlink?.slug,
        utmJson: automation.discountConfig?.utmJson,
      }
    });

    logger.info({
      automationId,
      contactId: contact.id,
      messageId: message.id,
      phone,
      shortlink: shortlink?.slug,
    }, 'Abandoned checkout automation sent successfully');

  } catch (error) {
    logger.error({
      error: error.message,
      jobId: job.id,
      automationId,
      checkoutToken,
    }, 'Failed to process abandoned checkout automation');
    throw error;
  }
}

/**
 * Process order created automation job
 */
export async function processOrderCreatedAutomation(job) {
  const { automationId, orderId, customerId, email, phone, totalPrice, currency } = job.payload;
  
  try {
    logger.info({
      jobId: job.id,
      automationId,
      orderId,
      customerId,
    }, 'Processing order created automation');

    // Get automation configuration
    const automation = await prisma.automation.findUnique({
      where: { id: automationId }
    });

    if (!automation || !automation.enabled) {
      logger.warn({
        automationId,
        enabled: automation?.enabled,
      }, 'Automation not found or disabled');
      return;
    }

    // Get shop information
    const shop = await prisma.shop.findUnique({
      where: { domain: job.shopId }
    });

    if (!shop) {
      logger.error({
        shopId: job.shopId,
      }, 'Shop not found for automation');
      return;
    }

    // Check if customer has opted out
    if (customerId) {
      const contact = await prisma.contact.findFirst({
        where: {
          shopId: job.shopId,
          customerId: customerId.toString(),
        }
      });

      if (contact && contact.optedOut) {
        logger.info({
          customerId,
          contactId: contact.id,
        }, 'Customer has opted out, skipping automation');
        return;
      }
    }

    // Prepare template variables
    const variables = {
      customer: {
        first_name: 'Customer', // We don't have this from order
        email: email,
        phone: phone,
      },
      order: {
        id: orderId,
        total_price: totalPrice,
        currency: currency,
      },
      shop: {
        name: shop.name,
        domain: shop.domain,
      },
    };

    // Render template
    const renderedTemplate = await renderTemplate({
      template: automation.template,
      variables,
      trigger: 'order_created',
    });

    if (!renderedTemplate.success) {
      logger.error({
        automationId,
        template: automation.template,
        errors: renderedTemplate.errors,
      }, 'Failed to render automation template');
      return;
    }

    // Check if we have a phone number to send to
    if (!phone) {
      logger.warn({
        automationId,
        orderId,
      }, 'No phone number available for order created automation');
      return;
    }

    // Create or get contact
    let contact = await prisma.contact.findFirst({
      where: {
        shopId: job.shopId,
        phoneE164: phone,
      }
    });

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          shopId: job.shopId,
          customerId: customerId?.toString(),
          phoneE164: phone,
          email: email,
          smsConsentState: 'opted_in', // Assume consent for order confirmation
          smsConsentSource: 'order_created',
          smsConsentAt: new Date(),
        }
      });
    }

    // Check consent again after creating contact
    if (contact.optedOut) {
      logger.info({
        contactId: contact.id,
      }, 'Contact has opted out, skipping automation');
      return;
    }

    // Send SMS
    const smsResult = await sendSMS({
      to: phone,
      message: renderedTemplate.text,
      shopId: job.shopId,
    });

    if (!smsResult.success) {
      logger.error({
        automationId,
        contactId: contact.id,
        phone,
        error: smsResult.error,
      }, 'Failed to send automation SMS');
      return;
    }

    // Create message record
    const message = await prisma.message.create({
      data: {
        shopId: job.shopId,
        contactId: contact.id,
        body: renderedTemplate.text,
        provider: 'mitto',
        status: 'sent',
        kind: 'automation',
        triggerKey: 'order_created',
        sentAt: new Date(),
      }
    });

    logger.info({
      automationId,
      contactId: contact.id,
      messageId: message.id,
      phone,
    }, 'Order created automation sent successfully');

  } catch (error) {
    logger.error({
      error: error.message,
      jobId: job.id,
      automationId,
      orderId,
    }, 'Failed to process order created automation');
    throw error;
  }
}
