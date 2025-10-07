// src/services/templates.js
// Liquid template engine with custom filters and validation

import { Liquid } from 'liquidjs';
import {
  money,
  date,
  shortlink,
  defaultFilter,
  titlecase,
  truncate,
  upper,
  lower,
} from '../lib/liquid-filters.js';
import { computeSmsSegments } from '../lib/sms-segments.js';

// Initialize Liquid engine in strict mode
const engine = new Liquid({
  strictVariables: true,
  strictFilters: true,
  cache: true,
});

// Register custom filters
engine.registerFilter('money', money);
engine.registerFilter('date', date);
engine.registerFilter('shortlink', shortlink);
engine.registerFilter('default', defaultFilter);
engine.registerFilter('titlecase', titlecase);
engine.registerFilter('truncate', truncate);
engine.registerFilter('upper', upper);
engine.registerFilter('lower', lower);

// Variable catalogs per trigger
const TRIGGER_VARIABLES = {
  abandoned_checkout: {
    required: ['recovery_url', 'checkout_id'],
    optional: ['customer_name', 'cart_total', 'currency', 'shop_name'],
    description: 'Abandoned checkout recovery',
  },
  order_created: {
    required: ['order_number', 'order_total'],
    optional: ['customer_name', 'currency', 'shop_name', 'order_url'],
    description: 'Order confirmation',
  },
  order_paid: {
    required: ['order_number', 'order_total'],
    optional: ['customer_name', 'currency', 'shop_name', 'order_url', 'tracking_number'],
    description: 'Order payment confirmation',
  },
  fulfillment_update: {
    required: ['order_number', 'tracking_number'],
    optional: ['customer_name', 'carrier', 'tracking_url', 'shop_name'],
    description: 'Fulfillment update',
  },
  welcome: {
    required: ['customer_name'],
    optional: ['shop_name', 'discount_code', 'discount_value'],
    description: 'Welcome message',
  },
  back_in_stock: {
    required: ['product_name', 'product_url'],
    optional: ['customer_name', 'shop_name', 'inventory_count'],
    description: 'Back in stock notification',
  },
};

/**
 * Render a template with variables and return text with warnings
 * @param {Object} params
 * @param {string} params.body - Template body
 * @param {Object} params.vars - Variables to render
 * @param {string} params.locale - Locale for formatting
 * @returns {Promise<{text: string, warnings: string[]}>}
 */
export async function renderTemplate({ body, vars = {}, locale: _locale = 'en-US' }) {
  const warnings = [];

  try {
    // Render the template
    const text = await engine.parseAndRender(body, vars);

    // Check for SMS segmentation
    const segments = computeSmsSegments(text);
    if (segments.parts > 1) {
      warnings.push(
        `SMS will be split into ${segments.parts} parts (${segments.chars} characters)`,
      );
    }

    if (segments.unicode) {
      warnings.push('Unicode characters detected - may affect delivery rates');
    }

    // Check for unknown variables in strict mode
    const unknownVars = findUnknownVariables(body, vars);
    if (unknownVars.length > 0) {
      warnings.push(`Unknown variables detected: ${unknownVars.join(', ')}`);
    }

    return { text, warnings };
  } catch (error) {
    // In strict mode, missing variables throw errors, but we want to handle them gracefully
    if (error.message.includes('undefined variable')) {
      const unknownVars = findUnknownVariables(body, vars);
      if (unknownVars.length > 0) {
        warnings.push(`Unknown variables detected: ${unknownVars.join(', ')}`);
      }
      // Return the template with variables as-is for missing ones
      const text = body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, varName) => {
        return vars[varName] !== undefined ? vars[varName] : match;
      });
      return { text, warnings };
    }
    throw new Error(`Template rendering failed: ${error.message}`);
  }
}

/**
 * Validate a template for a specific trigger
 * @param {Object} params
 * @param {string} params.body - Template body
 * @param {string} params.trigger - Trigger type
 * @returns {{ok: boolean, errors: string[], warnings: string[]}}
 */
export function validateTemplate({ body, trigger }) {
  const errors = [];
  const warnings = [];

  // Check if trigger is supported
  if (!TRIGGER_VARIABLES[trigger]) {
    errors.push(`Unsupported trigger: ${trigger}`);
    return { ok: false, errors, warnings };
  }

  const triggerVars = TRIGGER_VARIABLES[trigger];

  // Extract variables from template
  const templateVars = extractVariablesFromTemplate(body);

  // Check for missing required variables
  const missingRequired = triggerVars.required.filter((req) => !templateVars.includes(req));
  if (missingRequired.length > 0) {
    errors.push(`Missing required variables: ${missingRequired.join(', ')}`);
  }

  // Check for unknown variables
  const unknownVars = templateVars.filter(
    (v) => !triggerVars.required.includes(v) && !triggerVars.optional.includes(v),
  );
  if (unknownVars.length > 0) {
    warnings.push(`Unknown variables: ${unknownVars.join(', ')}`);
  }

  // Check for SMS segmentation
  const segments = computeSmsSegments(body);
  if (segments.parts > 1) {
    warnings.push(`Template will create ${segments.parts} SMS parts`);
  }

  if (segments.unicode) {
    warnings.push('Unicode characters may affect delivery rates');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * List available variables for a trigger
 * @param {string} trigger - Trigger type
 * @returns {string[]} Array of variable names
 */
export function listVariables(trigger) {
  if (!TRIGGER_VARIABLES[trigger]) {
    return [];
  }

  const triggerVars = TRIGGER_VARIABLES[trigger];
  return [...triggerVars.required, ...triggerVars.optional];
}

/**
 * Get trigger variable schema
 * @param {string} trigger - Trigger type
 * @returns {Object} Variable schema
 */
export function getTriggerSchema(trigger) {
  return TRIGGER_VARIABLES[trigger] || null;
}

/**
 * Default templates for each trigger
 */
export const templateDefaults = {
  order_paid: 'Order {{ order_number }} confirmed! Total: {{ order_total | money currency }}',
  abandoned_checkout: 'Complete your order: {{ recovery_url }}',
  fulfillment_update: 'Order {{ order_number }} shipped! Track: {{ tracking_url | shortlink }}',
  welcome:
    'Welcome {{ customer_name | titlecase }}! Use code {{ discount_code | upper }} for {{ discount_value }}% off!',
  back_in_stock: '{{ product_name }} is back in stock! Shop now: {{ product_url | shortlink }}',
  order_created: 'Order {{ order_number }} confirmed! Total: {{ order_total | money currency }}',
};

// Helper functions

/**
 * Extract variables from template body
 * @param {string} body - Template body
 * @returns {string[]} Array of variable names
 */
function extractVariablesFromTemplate(body) {
  const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const variables = new Set();
  let match;

  while ((match = variableRegex.exec(body)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * Find unknown variables in template
 * @param {string} body - Template body
 * @param {Object} vars - Available variables
 * @returns {string[]} Array of unknown variable names
 */
function findUnknownVariables(body, vars) {
  const templateVars = extractVariablesFromTemplate(body);
  const availableVars = Object.keys(vars);

  return templateVars.filter((v) => !availableVars.includes(v));
}
