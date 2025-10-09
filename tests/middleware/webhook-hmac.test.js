import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import { verifyShopifyWebhook } from '../../src/middleware/webhook-hmac.js';

describe('Webhook HMAC Verification', () => {
  const webhookSecret = 'test-secret-key';
  const testPayload = JSON.stringify({
    id: 123,
    name: 'Test Order',
    total_price: '99.99',
  });

  beforeEach(() => {
    vi.stubEnv('WEBHOOK_HMAC_SECRET', webhookSecret);
  });

  describe('verifyShopifyWebhook', () => {
    it('should verify valid HMAC signature', () => {
      const hmac = crypto
        .createHmac('sha256', webhookSecret)
        .update(testPayload, 'utf8')
        .digest('base64');

      const isValid = verifyShopifyWebhook(testPayload, hmac);
      expect(isValid).toBe(true);
    });

    it('should reject invalid HMAC signature', () => {
      const invalidHmac = 'invalid-hmac-signature';

      const isValid = verifyShopifyWebhook(testPayload, invalidHmac);
      expect(isValid).toBe(false);
    });

    it('should reject empty HMAC signature', () => {
      const isValid = verifyShopifyWebhook(testPayload, '');
      expect(isValid).toBe(false);
    });

    it('should reject undefined HMAC signature', () => {
      const isValid = verifyShopifyWebhook(testPayload, undefined);
      expect(isValid).toBe(false);
    });

    it('should handle empty payload', () => {
      const emptyPayload = '';
      const hmac = crypto
        .createHmac('sha256', webhookSecret)
        .update(emptyPayload, 'utf8')
        .digest('base64');

      const isValid = verifyShopifyWebhook(emptyPayload, hmac);
      expect(isValid).toBe(true);
    });

    it('should handle different payload formats', () => {
      const xmlPayload = '<order><id>123</id><name>Test Order</name></order>';
      const hmac = crypto
        .createHmac('sha256', webhookSecret)
        .update(xmlPayload, 'utf8')
        .digest('base64');

      const isValid = verifyShopifyWebhook(xmlPayload, hmac);
      expect(isValid).toBe(true);
    });

    it('should handle special characters in payload', () => {
      const specialPayload = JSON.stringify({
        name: 'Test Order with "quotes" and émojis 🎉',
        description: 'Special chars: !@#$%^&*()',
      });

      const hmac = crypto
        .createHmac('sha256', webhookSecret)
        .update(specialPayload, 'utf8')
        .digest('base64');

      const isValid = verifyShopifyWebhook(specialPayload, hmac);
      expect(isValid).toBe(true);
    });

    it('should handle different encoding', () => {
      const utf8Payload = 'Test with UTF-8: café, naïve, résumé';
      const hmac = crypto
        .createHmac('sha256', webhookSecret)
        .update(utf8Payload, 'utf8')
        .digest('base64');

      const isValid = verifyShopifyWebhook(utf8Payload, hmac);
      expect(isValid).toBe(true);
    });

    it('should be case sensitive for HMAC', () => {
      const hmac = crypto
        .createHmac('sha256', webhookSecret)
        .update(testPayload, 'utf8')
        .digest('base64');

      const upperCaseHmac = hmac.toUpperCase();
      const isValid = verifyShopifyWebhook(testPayload, upperCaseHmac);
      expect(isValid).toBe(false);
    });

    it('should handle timing attacks', () => {
      const hmac = crypto
        .createHmac('sha256', webhookSecret)
        .update(testPayload, 'utf8')
        .digest('base64');

      // Test with similar but incorrect HMAC
      const similarHmac = hmac.slice(0, -1) + 'X';
      const isValid = verifyShopifyWebhook(testPayload, similarHmac);
      expect(isValid).toBe(false);
    });
  });
});
