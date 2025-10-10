// src/routes/admin-health-shopify.js
// Admin health endpoint for Shopify integration status

import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { getShopifyClient } from '../lib/shopify/shopifyClient.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();
const router = Router();

/**
 * GET /admin/health/shopify
 * Returns Shopify integration health status
 */
router.get('/shopify', async (req, res) => {
  try {
    const { shopDomain } = req.query;
    
    if (!shopDomain) {
      return res.status(400).json({ 
        error: 'missing_shop_domain', 
        message: 'shopDomain query parameter is required' 
      });
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain }
    });

    if (!shop) {
      return res.status(404).json({ 
        error: 'shop_not_found', 
        message: `Shop ${shopDomain} not found` 
      });
    }

    // @cursor:start(health-checks)
    const health = {
      shop: {
        domain: shop.domain,
        installed: !!shop.tokenOffline,
        lastSeen: shop.updatedAt
      },
      webhooks: await checkWebhookHealth(shopDomain),
      api: await checkApiHealth(shopDomain),
      scopes: await checkScopesHealth(shopDomain),
      bulkOperations: await checkBulkOperationsHealth(shopDomain)
    };

    const isHealthy = health.webhooks.registered && 
                     health.api.accessible && 
                     health.scopes.valid;

    res.status(200).json({
      ok: isHealthy,
      shopDomain,
      health,
      timestamp: new Date().toISOString()
    });
    // @cursor:end(health-checks)

  } catch (error) {
    logger.error({ 
      error: error.message, 
      shopDomain: req.query.shopDomain 
    }, 'Failed to check Shopify health');
    
    res.status(500).json({ 
      error: 'health_check_failed', 
      message: error.message 
    });
  }
});

// @cursor:start(webhook-health)
async function checkWebhookHealth(shopDomain) {
  try {
    const client = await getShopifyClient(shopDomain);
    
    // Check webhook subscriptions
    const result = await client.graphql(`
      query {
        webhookSubscriptions(first: 50) {
          edges {
            node {
              id
              topic
              callbackUrl
              createdAt
            }
          }
        }
      }
    `);

    const webhooks = result.webhookSubscriptions?.edges?.map(edge => edge.node) || [];
    const requiredTopics = [
      'ORDERS_CREATE', 'ORDERS_PAID', 'ORDERS_FULFILLED',
      'FULFILLMENTS_CREATE', 'FULFILLMENTS_UPDATE',
      'CHECKOUTS_CREATE', 'CHECKOUTS_UPDATE',
      'CUSTOMERS_CREATE', 'CUSTOMERS_UPDATE',
      'CUSTOMERS_MARKETING_CONSENT_UPDATE',
      'INVENTORY_LEVELS_UPDATE',
      'CUSTOMERS_DATA_REQUEST', 'CUSTOMERS_REDACT', 'SHOP_REDACT',
      'APP_UNINSTALLED'
    ];

    const registeredTopics = webhooks.map(w => w.topic);
    const missingTopics = requiredTopics.filter(topic => !registeredTopics.includes(topic));

    return {
      registered: missingTopics.length === 0,
      total: webhooks.length,
      required: requiredTopics.length,
      missing: missingTopics,
      webhooks: webhooks.map(w => ({
        topic: w.topic,
        callbackUrl: w.callbackUrl,
        createdAt: w.createdAt
      }))
    };
  } catch (error) {
    return {
      registered: false,
      error: error.message
    };
  }
}
// @cursor:end(webhook-health)

// @cursor:start(api-health)
async function checkApiHealth(shopDomain) {
  try {
    const client = await getShopifyClient(shopDomain);
    
    // Test basic API access
    const result = await client.graphql(`
      query {
        shop {
          name
          myshopifyDomain
        }
      }
    `);

    return {
      accessible: true,
      shopName: result.shop?.name,
      domain: result.shop?.myshopifyDomain
    };
  } catch (error) {
    return {
      accessible: false,
      error: error.message
    };
  }
}
// @cursor:end(api-health)

// @cursor:start(scopes-health)
async function checkScopesHealth(shopDomain) {
  try {
    const client = await getShopifyClient(shopDomain);
    
    // Check if we can access webhook management (requires webhook scopes)
    const result = await client.graphql(`
      query {
        webhookSubscriptions(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    `);

    return {
      valid: true,
      webhookScopes: true
    };
  } catch (error) {
    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      return {
        valid: false,
        error: 'Missing webhook scopes',
        webhookScopes: false
      };
    }
    
    return {
      valid: false,
      error: error.message
    };
  }
}
// @cursor:end(scopes-health)

// @cursor:start(bulk-health)
async function checkBulkOperationsHealth(shopDomain) {
  try {
    const client = await getShopifyClient(shopDomain);
    
    // Check current bulk operation status
    const result = await client.graphql(`
      query {
        currentBulkOperation {
          id
          status
          createdAt
          completedAt
          objectCount
        }
      }
    `);

    return {
      available: true,
      currentOperation: result.currentBulkOperation
    };
  } catch (error) {
    return {
      available: false,
      error: error.message
    };
  }
}
// @cursor:end(bulk-health)

export default router;
