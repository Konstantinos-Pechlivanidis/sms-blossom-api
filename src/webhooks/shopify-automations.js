import { Router } from 'express';
import crypto from 'crypto';
import { getPrismaClient } from '../db/prismaClient.js';
import { fetchAbandonedCheckoutUrl } from '../services/shopify-graphql.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();
const router = Router();

// HMAC verification middleware
function verifyShopifyHmac(req, res, next) {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const body = req.rawBody || req.body;
  
  if (!hmac) {
    return res.status(401).json({ error: 'missing_hmac' });
  }

  const secret = process.env.WEBHOOK_HMAC_SECRET;
  if (!secret) {
    logger.error('WEBHOOK_HMAC_SECRET not configured');
    return res.status(500).json({ error: 'hmac_secret_not_configured' });
  }

  const calculatedHmac = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  if (calculatedHmac !== hmac) {
    logger.warn({
      provided: hmac,
      calculated: calculatedHmac,
      shop: req.get('X-Shopify-Shop-Domain'),
    }, 'Invalid HMAC signature');
    return res.status(401).json({ error: 'invalid_hmac' });
  }

  next();
}

// Idempotency check middleware
async function checkIdempotency(req, res, next) {
  const shopDomain = req.get('X-Shopify-Shop-Domain');
  const idempotencyKey = req.get('X-Shopify-Webhook-Id') || req.get('X-Shopify-Idempotency-Key');
  
  if (!idempotencyKey) {
    return res.status(400).json({ error: 'missing_idempotency_key' });
  }

  // Check if we've already processed this webhook
  const existingEvent = await prisma.event.findFirst({
    where: {
      shopId: shopDomain,
      idempotencyKey,
    }
  });

  if (existingEvent) {
    logger.info({
      shopDomain,
      idempotencyKey,
    }, 'Webhook already processed, skipping');
    return res.status(200).json({ message: 'already_processed' });
  }

  // Store the idempotency key for this request
  req.idempotencyKey = idempotencyKey;
  next();
}

// Apply middleware to all routes
router.use(verifyShopifyHmac);
router.use(checkIdempotency);

// Handle checkouts/update webhook (abandoned checkout detection)
router.post('/checkouts/update', async (req, res) => {
  try {
    const shopDomain = req.get('X-Shopify-Shop-Domain');
    const checkout = req.body;
    
    // Store the webhook event
    await prisma.event.create({
      data: {
        shopId: shopDomain,
        topic: 'checkouts/update',
        objectId: checkout.id?.toString(),
        raw: checkout,
        dedupeKey: `checkout_${checkout.id}`,
        idempotencyKey: req.idempotencyKey,
        checkoutToken: checkout.token,
        hmacHeader: req.get('X-Shopify-Hmac-Sha256'),
      }
    });

    // Check if this is an abandoned checkout
    const isAbandoned = checkout.abandoned_checkout_url && 
                       checkout.updated_at && 
                       new Date(checkout.updated_at) < new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

    if (isAbandoned) {
      // Get shop access token
      const shop = await prisma.shop.findUnique({
        where: { domain: shopDomain }
      });

      if (!shop || !shop.tokenOffline) {
        logger.warn({ shopDomain }, 'Shop not found or no access token for abandoned checkout');
        return res.status(200).json({ message: 'processed' });
      }

      // Fetch abandoned checkout URL from Shopify
      let abandonedCheckoutUrl;
      try {
        const checkoutData = await fetchAbandonedCheckoutUrl({
          shopDomain,
          accessToken: shop.tokenOffline,
          checkoutToken: checkout.token
        });
        abandonedCheckoutUrl = checkoutData.abandonedCheckout?.abandonedCheckoutUrl;
      } catch (error) {
        logger.error({
          error: error.message,
          shopDomain,
          checkoutToken: checkout.token,
        }, 'Failed to fetch abandoned checkout URL');
      }

      // Store abandoned checkout record
      await prisma.abandonedCheckout.upsert({
        where: { checkoutToken: checkout.token },
        update: {
          customerId: checkout.customer?.id?.toString(),
          email: checkout.email,
          phone: checkout.phone,
          totalPrice: checkout.total_price ? parseFloat(checkout.total_price) : null,
          currency: checkout.currency,
          abandonedAt: new Date(checkout.updated_at),
          abandonedCheckoutUrl,
        },
        create: {
          shopId: shopDomain,
          checkoutToken: checkout.token,
          customerId: checkout.customer?.id?.toString(),
          email: checkout.email,
          phone: checkout.phone,
          totalPrice: checkout.total_price ? parseFloat(checkout.total_price) : null,
          currency: checkout.currency,
          abandonedAt: new Date(checkout.updated_at),
          abandonedCheckoutUrl,
        }
      });

      // Check if automations are enabled for this shop
      const automations = await prisma.automation.findMany({
        where: {
          shopId: shopDomain,
          trigger: 'abandoned_checkout',
          enabled: true,
        }
      });

      for (const automation of automations) {
        // Schedule abandoned checkout job
        const runAt = new Date(Date.now() + automation.delayMinutes * 60 * 1000);
        
        await prisma.job.create({
          data: {
            shopId: shopDomain,
            type: 'automation:abandoned:send',
            status: 'pending',
            runAt,
            payload: {
              automationId: automation.id,
              checkoutToken: checkout.token,
              customerId: checkout.customer?.id?.toString(),
              email: checkout.email,
              phone: checkout.phone,
              totalPrice: checkout.total_price,
              currency: checkout.currency,
              abandonedCheckoutUrl,
            },
            dedupeKey: `abandoned_${automation.id}_${checkout.token}`,
          }
        });

        logger.info({
          shopDomain,
          automationId: automation.id,
          checkoutToken: checkout.token,
          runAt,
        }, 'Scheduled abandoned checkout automation');
      }
    }

    res.status(200).json({ message: 'processed' });
  } catch (error) {
    logger.error({
      error: error.message,
      shopDomain: req.get('X-Shopify-Shop-Domain'),
    }, 'Failed to process checkouts/update webhook');
    
    res.status(500).json({ error: 'processing_failed' });
  }
});

// Handle orders/create webhook
router.post('/orders/create', async (req, res) => {
  try {
    const shopDomain = req.get('X-Shopify-Shop-Domain');
    const order = req.body;
    
    // Store the webhook event
    await prisma.event.create({
      data: {
        shopId: shopDomain,
        topic: 'orders/create',
        objectId: order.id?.toString(),
        raw: order,
        dedupeKey: `order_${order.id}`,
        idempotencyKey: req.idempotencyKey,
        orderId: order.id?.toString(),
        hmacHeader: req.get('X-Shopify-Hmac-Sha256'),
      }
    });

    // Cancel any pending abandoned checkout jobs for this customer
    if (order.customer?.id) {
      const pendingJobs = await prisma.job.findMany({
        where: {
          shopId: shopDomain,
          type: 'automation:abandoned:send',
          status: 'pending',
          payload: {
            path: ['customerId'],
            equals: order.customer.id.toString()
          }
        }
      });

      for (const job of pendingJobs) {
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'canceled',
            lastError: 'Order created, canceling abandoned checkout automation',
          }
        });
      }

      logger.info({
        shopDomain,
        orderId: order.id,
        customerId: order.customer.id,
        canceledJobs: pendingJobs.length,
      }, 'Canceled abandoned checkout automations due to order creation');
    }

    res.status(200).json({ message: 'processed' });
  } catch (error) {
    logger.error({
      error: error.message,
      shopDomain: req.get('X-Shopify-Shop-Domain'),
    }, 'Failed to process orders/create webhook');
    
    res.status(500).json({ error: 'processing_failed' });
  }
});

// Handle orders/paid webhook
router.post('/orders/paid', async (req, res) => {
  try {
    const shopDomain = req.get('X-Shopify-Shop-Domain');
    const order = req.body;
    
    // Store the webhook event
    await prisma.event.create({
      data: {
        shopId: shopDomain,
        topic: 'orders/paid',
        objectId: order.id?.toString(),
        raw: order,
        dedupeKey: `order_paid_${order.id}`,
        idempotencyKey: req.idempotencyKey,
        orderId: order.id?.toString(),
        hmacHeader: req.get('X-Shopify-Hmac-Sha256'),
      }
    });

    // Cancel any pending abandoned checkout jobs for this customer
    if (order.customer?.id) {
      const pendingJobs = await prisma.job.findMany({
        where: {
          shopId: shopDomain,
          type: 'automation:abandoned:send',
          status: 'pending',
          payload: {
            path: ['customerId'],
            equals: order.customer.id.toString()
          }
        }
      });

      for (const job of pendingJobs) {
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'canceled',
            lastError: 'Order paid, canceling abandoned checkout automation',
          }
        });
      }

      logger.info({
        shopDomain,
        orderId: order.id,
        customerId: order.customer.id,
        canceledJobs: pendingJobs.length,
      }, 'Canceled abandoned checkout automations due to order payment');
    }

    res.status(200).json({ message: 'processed' });
  } catch (error) {
    logger.error({
      error: error.message,
      shopDomain: req.get('X-Shopify-Shop-Domain'),
    }, 'Failed to process orders/paid webhook');
    
    res.status(500).json({ error: 'processing_failed' });
  }
});

export default router;
