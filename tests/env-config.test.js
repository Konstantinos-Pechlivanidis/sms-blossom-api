// tests/env-config.test.js
// Environment configuration tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getWebhookHmacSecret, getRedisUrl, getMittoApiKey } from '../src/config/env.js';

describe('Environment Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear environment variables
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Webhook HMAC Secret', () => {
    it('should use canonical WEBHOOK_HMAC_SECRET when set', () => {
      process.env.WEBHOOK_HMAC_SECRET = 'canonical-secret';
      process.env.WEBHOOK_SECRET = 'legacy-secret';

      const secret = getWebhookHmacSecret();
      expect(secret).toBe('canonical-secret');
    });

    it('should fall back to legacy WEBHOOK_SECRET when canonical not set', () => {
      delete process.env.WEBHOOK_HMAC_SECRET;
      process.env.WEBHOOK_SECRET = 'legacy-secret';

      const secret = getWebhookHmacSecret();
      expect(secret).toBe('legacy-secret');
    });

    it('should throw error when neither is set', () => {
      delete process.env.WEBHOOK_HMAC_SECRET;
      delete process.env.WEBHOOK_SECRET;

      expect(() => getWebhookHmacSecret()).toThrow('WEBHOOK_HMAC_SECRET environment variable is required');
    });
  });

  describe('Redis URL', () => {
    it('should use REDIS_URL when set', () => {
      process.env.REDIS_URL = 'redis://custom:6379';
      
      const url = getRedisUrl();
      expect(url).toBe('redis://custom:6379');
    });

    it('should fall back to default when not set', () => {
      delete process.env.REDIS_URL;
      
      const url = getRedisUrl();
      expect(url).toBe('redis://localhost:6379');
    });
  });

  describe('Mitto API Key', () => {
    it('should return API key when set', () => {
      process.env.MITTO_API_KEY = 'test-key';
      
      const key = getMittoApiKey();
      expect(key).toBe('test-key');
    });

    it('should throw error when not set', () => {
      delete process.env.MITTO_API_KEY;
      
      expect(() => getMittoApiKey()).toThrow('MITTO_API_KEY environment variable is required');
    });
  });
});
