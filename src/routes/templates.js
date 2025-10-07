// src/routes/templates.js
// Template preview and validation endpoints

import { Router } from 'express';
import {
  renderTemplate,
  validateTemplate,
  listVariables,
  getTriggerSchema,
} from '../services/templates.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * Preview template rendering
 * POST /templates/preview
 */
router.post('/preview', async (req, res) => {
  try {
    const { trigger, body, sampleId } = req.body;

    if (!trigger || !body) {
      return res.status(400).json({
        error: 'Missing required fields: trigger, body',
      });
    }

    // Get sample data for the trigger
    const sampleData = getSampleData(trigger, sampleId);

    // Render the template
    const result = await renderTemplate({
      body,
      vars: sampleData,
      locale: req.body.locale || 'en-US',
    });

    res.json({
      ok: true,
      text: result.text,
      warnings: result.warnings,
      trigger,
      sampleData,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Template preview failed');
    res.status(500).json({
      error: 'Template preview failed',
      details: error.message,
    });
  }
});

/**
 * Validate template
 * POST /templates/validate
 */
router.post('/validate', (req, res) => {
  try {
    const { trigger, body } = req.body;

    if (!trigger || !body) {
      return res.status(400).json({
        error: 'Missing required fields: trigger, body',
      });
    }

    const result = validateTemplate({ body, trigger });

    res.json({
      ok: result.ok,
      errors: result.errors,
      warnings: result.warnings,
      trigger,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Template validation failed');
    res.status(500).json({
      error: 'Template validation failed',
      details: error.message,
    });
  }
});

/**
 * List variables for a trigger
 * GET /templates/variables/:trigger
 */
router.get('/variables/:trigger', (req, res) => {
  try {
    const { trigger } = req.params;

    const variables = listVariables(trigger);
    const schema = getTriggerSchema(trigger);

    if (!schema) {
      return res.status(404).json({
        error: 'Trigger not found',
        trigger,
      });
    }

    res.json({
      ok: true,
      trigger,
      variables,
      schema: {
        required: schema.required,
        optional: schema.optional,
        description: schema.description,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Get variables failed');
    res.status(500).json({
      error: 'Get variables failed',
      details: error.message,
    });
  }
});

/**
 * List all supported triggers
 * GET /templates/triggers
 */
router.get('/triggers', (req, res) => {
  try {
    const triggers = [
      'abandoned_checkout',
      'order_created',
      'order_paid',
      'fulfillment_update',
      'welcome',
      'back_in_stock',
    ];

    res.json({
      ok: true,
      triggers,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Get triggers failed');
    res.status(500).json({
      error: 'Get triggers failed',
      details: error.message,
    });
  }
});

/**
 * Get sample data for a trigger
 * @param {string} trigger - Trigger type
 * @param {string} sampleId - Sample ID
 * @returns {Object} Sample data
 */
function getSampleData(trigger, sampleId = 'default') {
  const samples = {
    abandoned_checkout: {
      default: {
        recovery_url: 'https://shop.myshopify.com/checkout/recovery/abc123',
        checkout_id: 'gid://shopify/Checkout/123456789',
        customer_name: 'John Doe',
        cart_total: 99.99,
        currency: 'USD',
        shop_name: 'My Store',
      },
    },
    order_created: {
      default: {
        order_number: '#1001',
        order_total: 149.99,
        customer_name: 'Jane Smith',
        currency: 'USD',
        shop_name: 'My Store',
        order_url: 'https://shop.myshopify.com/orders/1001',
      },
    },
    order_paid: {
      default: {
        order_number: '#1001',
        order_total: 149.99,
        customer_name: 'Jane Smith',
        currency: 'USD',
        shop_name: 'My Store',
        order_url: 'https://shop.myshopify.com/orders/1001',
        tracking_number: '1Z999AA1234567890',
      },
    },
    fulfillment_update: {
      default: {
        order_number: '#1001',
        tracking_number: '1Z999AA1234567890',
        customer_name: 'Jane Smith',
        carrier: 'UPS',
        tracking_url: 'https://www.ups.com/track?trackingNumber=1Z999AA1234567890',
        shop_name: 'My Store',
      },
    },
    welcome: {
      default: {
        customer_name: 'John Doe',
        shop_name: 'My Store',
        discount_code: 'WELCOME10',
        discount_value: 10,
      },
    },
    back_in_stock: {
      default: {
        product_name: 'Amazing T-Shirt',
        product_url: 'https://shop.myshopify.com/products/amazing-t-shirt',
        customer_name: 'John Doe',
        shop_name: 'My Store',
        inventory_count: 5,
      },
    },
  };

  return samples[trigger]?.[sampleId] || samples[trigger]?.default || {};
}

export default router;
