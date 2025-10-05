// src/routes/automations.js
// Automations admin API with rules engine support

import { Router } from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { getPrismaClient } from '../db/prismaClient.js';
import { defaultSettings, defaultAutomationRules } from '../services/rules.js';
import { templateDefaults } from '../services/templates.js';

const prisma = getPrismaClient();
const router = Router();
const ajv = new Ajv({ allErrors: true, removeAdditional: true });
addFormats(ajv);

const schema = {
  type: 'object',
  properties: {
    orderPaid: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        template: { type: 'string', nullable: true },
        rules: {
          type: 'object',
          properties: {
            quietHours: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                start: { type: 'integer', minimum: 0, maximum: 23 },
                end: { type: 'integer', minimum: 0, maximum: 23 },
                zone: { type: 'string', nullable: true },
              },
              required: ['enabled', 'start', 'end'],
              additionalProperties: false,
            },
            frequencyCap: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                per: { type: 'string', enum: ['hour', 'day', 'week'] },
                max: { type: 'integer', minimum: 1 },
              },
              required: ['enabled', 'per', 'max'],
              additionalProperties: false,
            },
            dedupeWindowMin: { type: 'integer', minimum: 0 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    abandoned: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        delayMinutes: { type: 'integer', minimum: 5, maximum: 1440, default: 30 },
        template: { type: 'string', nullable: true },
        rules: {
          type: 'object',
          properties: {
            quietHours: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                start: { type: 'integer', minimum: 0, maximum: 23 },
                end: { type: 'integer', minimum: 0, maximum: 23 },
                zone: { type: 'string', nullable: true },
              },
              required: ['enabled', 'start', 'end'],
              additionalProperties: false,
            },
            frequencyCap: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                per: { type: 'string', enum: ['hour', 'day', 'week'] },
                max: { type: 'integer', minimum: 1 },
              },
              required: ['enabled', 'per', 'max'],
              additionalProperties: false,
            },
            dedupeWindowMin: { type: 'integer', minimum: 0 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    fulfillmentUpdate: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        template: { type: 'string', nullable: true },
        rules: {
          type: 'object',
          properties: {
            quietHours: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                start: { type: 'integer', minimum: 0, maximum: 23 },
                end: { type: 'integer', minimum: 0, maximum: 23 },
                zone: { type: 'string', nullable: true },
              },
              required: ['enabled', 'start', 'end'],
              additionalProperties: false,
            },
            frequencyCap: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                per: { type: 'string', enum: ['hour', 'day', 'week'] },
                max: { type: 'integer', minimum: 1 },
              },
              required: ['enabled', 'per', 'max'],
              additionalProperties: false,
            },
            dedupeWindowMin: { type: 'integer', minimum: 0 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    welcome: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        template: { type: 'string', nullable: true },
        rules: {
          type: 'object',
          properties: {
            quietHours: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                start: { type: 'integer', minimum: 0, maximum: 23 },
                end: { type: 'integer', minimum: 0, maximum: 23 },
                zone: { type: 'string', nullable: true },
              },
              required: ['enabled', 'start', 'end'],
              additionalProperties: false,
            },
            frequencyCap: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                per: { type: 'string', enum: ['hour', 'day', 'week'] },
                max: { type: 'integer', minimum: 1 },
              },
              required: ['enabled', 'per', 'max'],
              additionalProperties: false,
            },
            dedupeWindowMin: { type: 'integer', minimum: 0 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    backInStock: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        template: { type: 'string', nullable: true },
        rules: {
          type: 'object',
          properties: {
            quietHours: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                start: { type: 'integer', minimum: 0, maximum: 23 },
                end: { type: 'integer', minimum: 0, maximum: 23 },
                zone: { type: 'string', nullable: true },
              },
              required: ['enabled', 'start', 'end'],
              additionalProperties: false,
            },
            frequencyCap: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                per: { type: 'string', enum: ['hour', 'day', 'week'] },
                max: { type: 'integer', minimum: 1 },
              },
              required: ['enabled', 'per', 'max'],
              additionalProperties: false,
            },
            dedupeWindowMin: { type: 'integer', minimum: 0 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};
const validate = ajv.compile(schema);

function mergeAutomations(s) {
  // Sprint B: expand structure and attach rules
  const base = {
    orderPaid: {
      enabled: true,
      template: templateDefaults['order_paid'],
      rules: defaultAutomationRules().order_paid.rules,
    },
    abandoned: {
      enabled: true,
      delayMinutes: 30,
      template: templateDefaults['abandoned_checkout'],
      rules: defaultAutomationRules().abandoned_checkout.rules,
    },
    fulfillmentUpdate: {
      enabled: true,
      template: templateDefaults['fulfillment_update'],
      rules: defaultAutomationRules().fulfillment_update.rules,
    },
    welcome: {
      enabled: true,
      template: templateDefaults['welcome'] || 'Καλώς ήρθες! 🎉',
      rules: defaultAutomationRules().welcome.rules,
    },
    backInStock: {
      enabled: true,
      template: 'Είναι πάλι διαθέσιμο! 🛒 {{ product.title }} — {{ product.url }}',
      rules: defaultAutomationRules().back_in_stock.rules,
    },
  };
  const a = (s && s.automations) || {};
  return {
    orderPaid: { ...base.orderPaid, ...(a.orderPaid || {}) },
    abandoned: { ...base.abandoned, ...(a.abandoned || {}) },
    fulfillmentUpdate: { ...base.fulfillmentUpdate, ...(a.fulfillmentUpdate || {}) },
    welcome: { ...base.welcome, ...(a.welcome || {}) },
    backInStock: { ...base.backInStock, ...(a.backInStock || {}) },
  };
}

function resolveShop(req) {
  return String(req.query.shop || req.get('X-Shopify-Shop-Domain') || '');
}

router.get('/', async (req, res) => {
  const domain = resolveShop(req);
  if (!domain) return res.status(400).json({ error: 'missing_shop' });
  const shop = await prisma.shop.findUnique({ where: { domain } });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });

  const settings = shop.settingsJson || defaultSettings();
  const automations = mergeAutomations(settings);
  res.json({ ok: true, shop: domain, automations });
});

router.put('/', async (req, res) => {
  const domain = resolveShop(req);
  if (!domain) return res.status(400).json({ error: 'missing_shop' });
  const shop = await prisma.shop.findUnique({ where: { domain } });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  if (!validate(body))
    return res.status(422).json({ error: 'invalid_payload', details: validate.errors });

  const settings = shop.settingsJson || defaultSettings();
  settings.automations = mergeAutomations(settings);
  settings.automations = { ...settings.automations, ...body };

  await prisma.shop.update({ where: { id: shop.id }, data: { settingsJson: settings } });
  res.json({ ok: true, shop: domain, automations: settings.automations });
});

export default router;
