import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  validateTemplate,
  listVariables,
  getTriggerSchema,
  computeSmsSegments as _computeSmsSegments,
} from '../../src/services/templates.js';
import { computeSmsSegments as computeSegments } from '../../src/lib/sms-segments.js';

/**
 * Unit tests for template engine
 * Tests Liquid rendering, validation, and SMS segmentation
 */
describe('Template Engine Unit Tests', () => {
  describe('renderTemplate', () => {
    it('should render template with variables', async () => {
      const result = await renderTemplate({
        body: 'Hello {{ customer.first_name }}, your order {{ order.number }} is ready!',
        vars: {
          customer: { first_name: 'John' },
          order: { number: '1001' },
        },
        locale: 'en',
      });

      expect(result.text).toBe('Hello John, your order 1001 is ready!');
      expect(result.warnings).toEqual([]);
    });

    it('should handle missing variables in strict mode', async () => {
      const result = await renderTemplate({
        body: 'Hello {{ customer.first_name }}, your order {{ order.number }} is ready!',
        vars: {
          customer: { first_name: 'John' },
          // order.number is missing
        },
        locale: 'en',
      });

      // In strict mode, missing variables should be left as-is
      expect(result.text).toBe('Hello John, your order {{ order.number }} is ready!');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('order.number'))).toBe(true);
    });

    it('should apply custom filters', async () => {
      const result = await renderTemplate({
        body: 'Price: {{ price | money }} | Date: {{ date | date }}',
        vars: {
          price: 29.99,
          date: '2024-01-15T10:30:00Z',
        },
        locale: 'en',
      });

      expect(result.text).toContain('$29.99');
      expect(result.text).toContain('Jan 15, 2024');
    });

    it('should handle default filter', async () => {
      const result = await renderTemplate({
        body: 'Hello {{ customer.first_name | default: "Customer" }}!',
        vars: {
          customer: { first_name: 'John' },
        },
        locale: 'en',
      });

      expect(result.text).toBe('Hello John!');
    });

    it('should handle default filter with missing variable', async () => {
      const result = await renderTemplate({
        body: 'Hello {{ customer.first_name | default: "Customer" }}!',
        vars: {
          customer: {},
        },
        locale: 'en',
      });

      expect(result.text).toBe('Hello Customer!');
    });
  });

  describe('validateTemplate', () => {
    it('should validate template with all required variables', () => {
      const result = validateTemplate({
        body: 'Hello {{ customer.first_name }}, your order {{ order.number }} is ready!',
        trigger: 'order_created',
      });

      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should detect missing required variables', () => {
      const result = validateTemplate({
        body: 'Hello {{ customer.first_name }}!',
        trigger: 'order_created',
      });

      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('order.number'))).toBe(true);
    });

    it('should detect unknown variables', () => {
      const result = validateTemplate({
        body: 'Hello {{ customer.first_name }}, your order {{ order.number }} is ready! {{ unknown.var }}',
        trigger: 'order_created',
      });

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('unknown.var'))).toBe(true);
    });

    it('should validate different triggers', () => {
      const triggers = [
        'abandoned_checkout',
        'order_created',
        'order_paid',
        'fulfillment_update',
        'welcome',
        'back_in_stock',
      ];

      triggers.forEach((trigger) => {
        const result = validateTemplate({
          body: 'Test template',
          trigger,
        });

        expect(result).toHaveProperty('ok');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
      });
    });
  });

  describe('listVariables', () => {
    it('should list variables for order_created trigger', () => {
      const variables = listVariables('order_created');

      expect(Array.isArray(variables)).toBe(true);
      expect(variables).toContain('customer.first_name');
      expect(variables).toContain('customer.last_name');
      expect(variables).toContain('order.number');
      expect(variables).toContain('order.total_price');
    });

    it('should list variables for abandoned_checkout trigger', () => {
      const variables = listVariables('abandoned_checkout');

      expect(Array.isArray(variables)).toBe(true);
      expect(variables).toContain('customer.first_name');
      expect(variables).toContain('checkout.token');
      expect(variables).toContain('recovery_url');
    });

    it('should return empty array for unknown trigger', () => {
      const variables = listVariables('unknown_trigger');

      expect(Array.isArray(variables)).toBe(true);
      expect(variables).toEqual([]);
    });
  });

  describe('getTriggerSchema', () => {
    it('should return schema for valid trigger', () => {
      const schema = getTriggerSchema('order_created');

      expect(schema).toHaveProperty('required');
      expect(schema).toHaveProperty('optional');
      expect(Array.isArray(schema.required)).toBe(true);
      expect(Array.isArray(schema.optional)).toBe(true);
    });

    it('should return empty schema for unknown trigger', () => {
      const schema = getTriggerSchema('unknown_trigger');

      expect(schema).toEqual({
        required: [],
        optional: [],
      });
    });
  });

  describe('SMS Segmentation', () => {
    it('should calculate GSM segments correctly', () => {
      const gsmText = 'Hello world! This is a test message.';
      const segments = computeSegments(gsmText);

      expect(segments.parts).toBe(1);
      expect(segments.characters).toBe(gsmText.length);
      expect(segments.encoding).toBe('GSM');
    });

    it('should calculate Unicode segments correctly', () => {
      const unicodeText = 'Hello 🌍! This is a test message with emoji.';
      const segments = computeSegments(unicodeText);

      expect(segments.parts).toBeGreaterThan(1);
      expect(segments.characters).toBe(unicodeText.length);
      expect(segments.encoding).toBe('Unicode');
    });

    it('should handle long messages', () => {
      const longText = 'A'.repeat(200); // 200 characters
      const segments = computeSegments(longText);

      expect(segments.parts).toBeGreaterThan(1);
      expect(segments.characters).toBe(200);
    });

    it('should handle empty message', () => {
      const segments = computeSegments('');

      expect(segments.parts).toBe(0);
      expect(segments.characters).toBe(0);
      expect(segments.encoding).toBe('GSM');
    });
  });

  describe('Template Warnings', () => {
    it('should warn about multi-part SMS', async () => {
      const longText = 'A'.repeat(200);
      const result = await renderTemplate({
        body: longText,
        vars: {},
        locale: 'en',
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('SMS will be split'))).toBe(true);
    });

    it('should warn about unknown variables', async () => {
      const result = await renderTemplate({
        body: 'Hello {{ unknown.variable }}!',
        vars: {},
        locale: 'en',
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('unknown.variable'))).toBe(true);
    });
  });

  describe('Filter Functions', () => {
    it('should format money correctly', async () => {
      const result = await renderTemplate({
        body: 'Price: {{ price | money }}',
        vars: { price: 29.99 },
        locale: 'en',
      });

      expect(result.text).toContain('$29.99');
    });

    it('should format date correctly', async () => {
      const result = await renderTemplate({
        body: 'Date: {{ date | date }}',
        vars: { date: '2024-01-15T10:30:00Z' },
        locale: 'en',
      });

      expect(result.text).toContain('Jan 15, 2024');
    });

    it('should truncate text correctly', async () => {
      const result = await renderTemplate({
        body: '{{ text | truncate: 10 }}',
        vars: { text: 'This is a very long text' },
        locale: 'en',
      });

      expect(result.text).toBe('This is a...');
    });

    it('should convert case correctly', async () => {
      const result = await renderTemplate({
        body: '{{ text | upper }} | {{ text | lower }}',
        vars: { text: 'Hello World' },
        locale: 'en',
      });

      expect(result.text).toBe('HELLO WORLD | hello world');
    });
  });
});
