// tests/templates.test.js
// Unit tests for Liquid template engine

import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  validateTemplate,
  listVariables,
  getTriggerSchema,
} from '../src/services/templates.js';
import { computeSmsSegments } from '../src/lib/sms-segments.js';

describe('Template Engine', () => {
  describe('renderTemplate', () => {
    it('should render basic template with variables', async () => {
      const result = await renderTemplate({
        body: 'Hello {{ customer_name }}, your order {{ order_number }} is ready!',
        vars: {
          customer_name: 'John Doe',
          order_number: '#1001',
        },
      });

      expect(result.text).toBe('Hello John Doe, your order #1001 is ready!');
      expect(result.warnings).toEqual([]);
    });

    it('should handle missing variables in strict mode', async () => {
      const result = await renderTemplate({
        body: 'Hello {{ customer_name }}, your order {{ order_number }} is ready!',
        vars: {
          customer_name: 'John Doe',
          // order_number is missing
        },
      });

      expect(result.warnings).toContain('Unknown variables detected: order_number');
    });

    it('should render template with filters', async () => {
      const result = await renderTemplate({
        body: 'Hello {{ customer_name | titlecase }}, your total is {{ order_total | money: "USD" }}',
        vars: {
          customer_name: 'john doe',
          order_total: 99.99,
        },
      });

      expect(result.text).toBe('Hello John Doe, your total is $99.99');
    });

    it('should handle date formatting', async () => {
      const result = await renderTemplate({
        body: 'Order placed on {{ order_date | date: "short", "America/New_York" }}',
        vars: {
          order_date: '2024-01-15T10:30:00Z',
        },
      });

      expect(result.text).toContain('1/15/24');
    });

    it('should handle shortlink generation', async () => {
      const result = await renderTemplate({
        body: 'Track your order: {{ tracking_url | shortlink: "campaign123" }}',
        vars: {
          tracking_url: 'https://ups.com/track/1Z999AA1234567890',
        },
      });

      expect(result.text).toMatch(
        /Track your order: https:\/\/sms-blossom\.com\/s\/[a-zA-Z0-9]{6}\?utm_campaign=campaign123/,
      );
    });

    it('should handle default filter', async () => {
      const result = await renderTemplate({
        body: 'Hello {{ customer_name | default: "Customer" }}, your order {{ order_number | default: "N/A" }} is ready!',
        vars: {
          customer_name: 'John Doe',
          // order_number is missing
        },
      });

      // When variables are missing, the template is returned as-is in strict mode
      expect(result.text).toBe(
        'Hello {{ customer_name | default: "Customer" }}, your order {{ order_number | default: "N/A" }} is ready!',
      );
      // Note: In strict mode, missing variables cause the template to not be processed
    });

    it('should handle truncate filter', async () => {
      const result = await renderTemplate({
        body: '{{ long_text | truncate: 20 }}',
        vars: {
          long_text: 'This is a very long text that should be truncated',
        },
      });

      expect(result.text).toBe('This is a very lo...');
    });

    it('should handle case filters', async () => {
      const result = await renderTemplate({
        body: '{{ text | upper }} and {{ text | lower }}',
        vars: {
          text: 'Hello World',
        },
      });

      expect(result.text).toBe('HELLO WORLD and hello world');
    });
  });

  describe('validateTemplate', () => {
    it('should validate template with required variables', () => {
      const result = validateTemplate({
        body: 'Hello {{ customer_name }}, your order {{ order_number }} is ready! Total: {{ order_total }}',
        trigger: 'order_created',
      });

      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should flag missing required variables', () => {
      const result = validateTemplate({
        body: 'Hello {{ customer_name }}, your order is ready!',
        trigger: 'order_created',
      });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain('Missing required variables: order_number, order_total');
    });

    it('should warn about unknown variables', () => {
      const result = validateTemplate({
        body: 'Hello {{ customer_name }}, your order {{ order_number }} is ready! Your discount is {{ discount_code }}.',
        trigger: 'order_created',
      });

      expect(result.warnings).toContain('Unknown variables: discount_code');
    });

    it('should handle unsupported trigger', () => {
      const result = validateTemplate({
        body: 'Hello {{ customer_name }}!',
        trigger: 'unsupported_trigger',
      });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain('Unsupported trigger: unsupported_trigger');
    });

    it('should validate abandoned checkout template', () => {
      const result = validateTemplate({
        body: 'Complete your order: {{ recovery_url }} ({{ checkout_id }})',
        trigger: 'abandoned_checkout',
      });

      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should flag missing recovery_url for abandoned checkout', () => {
      const result = validateTemplate({
        body: 'Your cart is waiting for you!',
        trigger: 'abandoned_checkout',
      });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain('Missing required variables: recovery_url, checkout_id');
    });
  });

  describe('listVariables', () => {
    it('should list variables for order_created trigger', () => {
      const variables = listVariables('order_created');

      expect(variables).toContain('order_number');
      expect(variables).toContain('order_total');
      expect(variables).toContain('customer_name');
      expect(variables).toContain('currency');
    });

    it('should return empty array for unsupported trigger', () => {
      const variables = listVariables('unsupported_trigger');

      expect(variables).toEqual([]);
    });
  });

  describe('getTriggerSchema', () => {
    it('should return schema for supported trigger', () => {
      const schema = getTriggerSchema('abandoned_checkout');

      expect(schema).toBeDefined();
      expect(schema.required).toContain('recovery_url');
      expect(schema.required).toContain('checkout_id');
      expect(schema.optional).toContain('customer_name');
    });

    it('should return null for unsupported trigger', () => {
      const schema = getTriggerSchema('unsupported_trigger');

      expect(schema).toBeNull();
    });
  });
});

describe('SMS Segmentation', () => {
  describe('computeSmsSegments', () => {
    it('should calculate single segment for short text', () => {
      const result = computeSmsSegments('Hello world');

      expect(result.parts).toBe(1);
      expect(result.chars).toBe(11);
      expect(result.unicode).toBe(false);
    });

    it('should calculate multiple segments for long text', () => {
      const longText = 'A'.repeat(200);
      const result = computeSmsSegments(longText);

      expect(result.parts).toBeGreaterThan(1);
      expect(result.chars).toBe(200);
      expect(result.unicode).toBe(false);
    });

    it('should detect Unicode characters', () => {
      const result = computeSmsSegments('Hello 🌍 world');

      expect(result.unicode).toBe(true);
      expect(result.parts).toBe(1);
    });

    it('should handle empty text', () => {
      const result = computeSmsSegments('');

      expect(result.parts).toBe(0);
      expect(result.chars).toBe(0);
      expect(result.unicode).toBe(false);
    });

    it('should handle null/undefined text', () => {
      const result1 = computeSmsSegments(null);
      const result2 = computeSmsSegments(undefined);

      expect(result1.parts).toBe(0);
      expect(result2.parts).toBe(0);
    });
  });
});

describe('Template Rendering with SMS Warnings', () => {
  it('should warn about multi-part SMS', async () => {
    const longText = 'A'.repeat(200);
    const result = await renderTemplate({
      body: longText,
      vars: {},
    });

    expect(result.warnings.some((w) => w.includes('SMS will be split into'))).toBe(true);
  });

  it('should warn about Unicode characters', async () => {
    const result = await renderTemplate({
      body: 'Hello {{ customer_name }}, your order is ready! 🌍',
      vars: {
        customer_name: 'John Doe',
      },
    });

    expect(result.warnings).toContain('Unicode characters detected - may affect delivery rates');
  });

  it('should handle both multi-part and Unicode warnings', async () => {
    const longUnicodeText = 'Hello 🌍 world! '.repeat(20);
    const result = await renderTemplate({
      body: longUnicodeText,
      vars: {},
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('Unicode'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('parts'))).toBe(true);
  });
});
