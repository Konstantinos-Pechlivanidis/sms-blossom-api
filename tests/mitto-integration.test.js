// tests/mitto-integration.test.js
// Integration tests for Mitto provider and delivery system

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendSms, mapErrorToStatus, getMittoClient } from '../src/providers/mitto.js';
import { processDelivery } from '../src/queue/processors/delivery.js';
import { getCachedReport, setCachedReport } from '../src/lib/reports-cache.js';
import {
  incrementSmsSendAttempts,
  incrementSmsSendErrors,
  incrementSmsDeliverySuccess,
  getAllMetrics,
} from '../src/lib/metrics.js';

// Mock fetch for Mitto API calls
global.fetch = vi.fn();

describe('Mitto Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MITTO_API_KEY = 'test-api-key';
    process.env.MITTO_API_URL = 'https://api.mitto.com';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Mitto Client', () => {
    it('should send SMS successfully', async () => {
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'mitto_msg_123',
            status: 'sent',
          }),
      };

      global.fetch.mockResolvedValueOnce(mockResponse);

      const result = await sendSms({
        to: '+1234567890',
        text: 'Test message',
        requestId: 'test_123',
      });

      expect(result).toEqual({
        provider_msg_id: 'mitto_msg_123',
        status: 'sent',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.mitto.com/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
            'X-Request-ID': 'test_123',
          }),
          body: JSON.stringify({
            to: '+1234567890',
            text: 'Test message',
          }),
        }),
      );
    });

    it('should handle network errors with retry', async () => {
      const networkError = new Error('Network timeout');
      networkError.name = 'AbortError';

      global.fetch
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'mitto_msg_123',
              status: 'sent',
            }),
        });

      const result = await sendSms({
        to: '+1234567890',
        text: 'Test message',
        requestId: 'test_123',
      });

      expect(result).toEqual({
        provider_msg_id: 'mitto_msg_123',
        status: 'sent',
      });

      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should classify errors correctly', () => {
      const transientError = new Error('Network timeout');
      transientError.name = 'AbortError';
      transientError.isTransient = true;

      const permanentError = new Error('Invalid phone number');
      permanentError.statusCode = 400;
      permanentError.isTransient = false;

      expect(mapErrorToStatus(transientError)).toBe('queued');
      expect(mapErrorToStatus(permanentError)).toBe('failed');
    });
  });

  describe('Delivery Processor', () => {
    it('should process delivery with metrics', async () => {
      const mockJob = {
        id: 'job_123',
        data: {
          shopId: 'shop_123',
          recipient: '+1234567890',
          template: 'Hello {{customer_name}}!',
          context: { customer_name: 'John Doe' },
          requestId: 'req_123',
        },
      };

      // Mock Mitto API response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'mitto_msg_123',
            status: 'sent',
          }),
      });

      // Mock Prisma operations
      const _mockPrisma = {
        message: {
          create: vi.fn().mockResolvedValue({
            id: 'msg_123',
            metadata: {},
          }),
          update: vi.fn().mockResolvedValue({}),
        },
      };

      // Mock renderTemplate
      vi.doMock('../src/services/templates.js', () => ({
        renderTemplate: vi.fn().mockResolvedValue({
          text: 'Hello John Doe!',
          warnings: [],
        }),
      }));

      await processDelivery(mockJob);

      expect(incrementSmsSendAttempts).toHaveBeenCalledWith('queued');
      expect(incrementSmsSendAttempts).toHaveBeenCalledWith('sent');
      expect(incrementSmsDeliverySuccess).toHaveBeenCalledWith('mitto');
    });
  });

  describe('Reports Caching', () => {
    it('should cache and retrieve reports', async () => {
      const shopId = 'shop_123';
      const reportType = 'overview';
      const reportData = { total: 100, sent: 80, delivered: 75 };

      // Mock Redis operations
      const mockRedis = {
        get: vi.fn(),
        setex: vi.fn(),
      };

      vi.doMock('../src/queue/queues.js', () => ({
        getRedisConnection: () => mockRedis,
      }));

      // Test cache miss
      mockRedis.get.mockResolvedValueOnce(null);
      const cached = await getCachedReport(shopId, reportType);
      expect(cached).toBeNull();

      // Test cache set
      await setCachedReport(shopId, reportType, reportData);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('reports:shop_123:overview:'),
        300, // TTL for overview
        JSON.stringify(reportData),
      );

      // Test cache hit
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(reportData));
      const cachedData = await getCachedReport(shopId, reportType);
      expect(cachedData).toEqual({
        data: reportData,
        fromCache: true,
      });
    });
  });

  describe('Metrics', () => {
    it('should record metrics correctly', () => {
      // Test SMS send attempts
      incrementSmsSendAttempts('sent');
      incrementSmsSendAttempts('failed');

      // Test SMS errors
      incrementSmsSendErrors('transient');
      incrementSmsSendErrors('permanent');

      // Test delivery success
      incrementSmsDeliverySuccess('mitto');

      const metrics = getAllMetrics();

      expect(metrics.sms_send_attempts.total).toBe(2);
      expect(metrics.sms_send_attempts.by_status.sent).toBe(1);
      expect(metrics.sms_send_attempts.by_status.failed).toBe(1);

      expect(metrics.sms_send_errors.total).toBe(2);
      expect(metrics.sms_send_errors.by_type.transient).toBe(1);
      expect(metrics.sms_send_errors.by_type.permanent).toBe(1);

      expect(metrics.sms_delivery_success.total).toBe(1);
      expect(metrics.sms_delivery_success.by_provider.mitto).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle Mitto API errors gracefully', async () => {
      const apiError = new Error('HTTP 400: Bad Request');
      apiError.statusCode = 400;

      global.fetch.mockRejectedValueOnce(apiError);

      await expect(
        sendSms({
          to: '+1234567890',
          text: 'Test message',
          requestId: 'test_123',
        }),
      ).rejects.toThrow('HTTP 400: Bad Request');

      expect(mapErrorToStatus(apiError)).toBe('failed');
    });

    it('should handle network timeouts', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'AbortError';

      global.fetch.mockRejectedValueOnce(timeoutError);

      await expect(
        sendSms({
          to: '+1234567890',
          text: 'Test message',
          requestId: 'test_123',
        }),
      ).rejects.toThrow('Request timeout');

      expect(mapErrorToStatus(timeoutError)).toBe('queued');
    });
  });

  describe('Health Checks', () => {
    it('should perform health check', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const client = getMittoClient();
      const isHealthy = await client.healthCheck();

      expect(isHealthy).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.mitto.com/health',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        }),
      );
    });
  });
});
