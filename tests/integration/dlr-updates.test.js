import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MockMittoServer } from '../mocks/mock-mitto.js';

/**
 * Integration tests for DLR (Delivery Receipt) updates
 * Tests message status updates and delivery tracking
 */
describe('DLR Updates Integration', () => {
  let mockMitto;
  let mockPrisma;

  beforeAll(async () => {
    mockMitto = new MockMittoServer(3002);
    await mockMitto.start();
  });

  afterAll(async () => {
    await mockMitto.stop();
  });

  beforeEach(() => {
    // Reset mocks
    mockPrisma = {
      message: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      contact: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    // Mock the modules
    vi.doMock('../../src/db/prismaClient.js', () => ({
      prisma: mockPrisma,
    }));
  });

  describe('DLR Processing', () => {
    it('should update message status to delivered', async () => {
      const messageId = 'msg_123456789';
      const providerMsgId = 'provider_msg_123';
      const phoneE164 = '+1234567890';

      // Mock message data
      mockPrisma.message.findFirst.mockResolvedValue({
        id: messageId,
        shopId: 'shop-123',
        contactId: 'contact-123',
        phoneE164,
        body: 'Test message',
        status: 'sent',
        providerMsgId,
        sentAt: new Date(),
        deliveredAt: null,
        failedAt: null,
      });

      // Mock message update
      mockPrisma.message.update.mockResolvedValue({
        id: messageId,
        status: 'delivered',
        deliveredAt: new Date(),
        updatedAt: new Date(),
      });

      // Import and test the function
      const { processMittoDlr } = await import('../../src/webhooks/mitto-dlr.js');

      const dlrPayload = {
        message_id: providerMsgId,
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      };

      const result = await processMittoDlr(dlrPayload);

      // Verify message was found
      expect(mockPrisma.message.findFirst).toHaveBeenCalledWith({
        where: { providerMsgId },
      });

      // Verify message was updated
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: messageId },
        data: {
          status: 'delivered',
          deliveredAt: expect.any(Date),
        },
      });

      expect(result.success).toBe(true);
    });

    it('should update message status to failed', async () => {
      const messageId = 'msg_123456790';
      const providerMsgId = 'provider_msg_124';
      const phoneE164 = '+1234567891';

      // Mock message data
      mockPrisma.message.findFirst.mockResolvedValue({
        id: messageId,
        shopId: 'shop-123',
        contactId: 'contact-124',
        phoneE164,
        body: 'Test message',
        status: 'sent',
        providerMsgId,
        sentAt: new Date(),
        deliveredAt: null,
        failedAt: null,
      });

      // Mock message update
      mockPrisma.message.update.mockResolvedValue({
        id: messageId,
        status: 'failed',
        failedAt: new Date(),
        errorCode: 'INVALID_NUMBER',
        errorMessage: 'Invalid phone number format',
        updatedAt: new Date(),
      });

      const { processMittoDlr } = await import('../../src/webhooks/mitto-dlr.js');

      const dlrPayload = {
        message_id: providerMsgId,
        status: 'failed',
        delivered_at: null,
        error_code: 'INVALID_NUMBER',
        error_message: 'Invalid phone number format',
      };

      const result = await processMittoDlr(dlrPayload);

      // Verify message was updated with error details
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: messageId },
        data: {
          status: 'failed',
          failedAt: expect.any(Date),
          errorCode: 'INVALID_NUMBER',
          errorMessage: 'Invalid phone number format',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should handle message not found', async () => {
      const providerMsgId = 'nonexistent_msg';

      mockPrisma.message.findFirst.mockResolvedValue(null);

      const { processMittoDlr } = await import('../../src/webhooks/mitto-dlr.js');

      const dlrPayload = {
        message_id: providerMsgId,
        status: 'delivered',
        delivered_at: new Date().toISOString(),
      };

      const result = await processMittoDlr(dlrPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('message_not_found');
    });

    it('should handle database errors gracefully', async () => {
      const providerMsgId = 'provider_msg_125';

      mockPrisma.message.findFirst.mockRejectedValue(new Error('Database connection failed'));

      const { processMittoDlr } = await import('../../src/webhooks/mitto-dlr.js');

      const dlrPayload = {
        message_id: providerMsgId,
        status: 'delivered',
        delivered_at: new Date().toISOString(),
      };

      const result = await processMittoDlr(dlrPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('database_error');
    });
  });

  describe('Inbound Message Processing', () => {
    it('should process STOP message and update contact consent', async () => {
      const phoneE164 = '+1234567890';
      const messageText = 'STOP';

      // Mock contacts with this phone number
      mockPrisma.contact.findMany.mockResolvedValue([
        {
          id: 'contact-123',
          shopId: 'shop-123',
          phoneE164,
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          optedOut: false,
          smsConsentState: 'opted_in',
        },
      ]);

      // Mock contact update
      mockPrisma.contact.updateMany.mockResolvedValue({
        count: 1,
      });

      // Import and test the function
      const { processMittoInbound } = await import('../../src/webhooks/mitto-inbound.js');

      const inboundPayload = {
        from: phoneE164,
        text: messageText,
        timestamp: new Date().toISOString(),
      };

      const result = await processMittoInbound(inboundPayload);

      // Verify contacts were found
      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith({
        where: { phoneE164 },
      });

      // Verify contacts were updated
      expect(mockPrisma.contact.updateMany).toHaveBeenCalledWith({
        where: { phoneE164 },
        data: {
          optedOut: true,
          unsubscribedAt: expect.any(Date),
          smsConsentState: 'opted_out',
          smsConsentSource: 'inbound_stop',
        },
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('unsubscribe');
    });

    it('should process HELP message', async () => {
      const phoneE164 = '+1234567891';
      const messageText = 'HELP';

      mockPrisma.contact.findMany.mockResolvedValue([]);

      const { processMittoInbound } = await import('../../src/webhooks/mitto-inbound.js');

      const inboundPayload = {
        from: phoneE164,
        text: messageText,
        timestamp: new Date().toISOString(),
      };

      const result = await processMittoInbound(inboundPayload);

      expect(result.success).toBe(true);
      expect(result.action).toBe('help');
      expect(result.message).toContain('HELP');
    });

    it('should process regular inbound message', async () => {
      const phoneE164 = '+1234567892';
      const messageText = 'Thank you for the message!';

      mockPrisma.contact.findMany.mockResolvedValue([]);

      const { processMittoInbound } = await import('../../src/webhooks/mitto-inbound.js');

      const inboundPayload = {
        from: phoneE164,
        text: messageText,
        timestamp: new Date().toISOString(),
      };

      const result = await processMittoInbound(inboundPayload);

      expect(result.success).toBe(true);
      expect(result.action).toBe('received');
    });

    it('should handle multiple contacts with same phone number', async () => {
      const phoneE164 = '+1234567893';
      const messageText = 'STOP';

      // Mock multiple contacts with same phone number
      mockPrisma.contact.findMany.mockResolvedValue([
        {
          id: 'contact-123',
          shopId: 'shop-123',
          phoneE164,
          optedOut: false,
          smsConsentState: 'opted_in',
        },
        {
          id: 'contact-124',
          shopId: 'shop-456',
          phoneE164,
          optedOut: false,
          smsConsentState: 'opted_in',
        },
      ]);

      mockPrisma.contact.updateMany.mockResolvedValue({
        count: 2,
      });

      const { processMittoInbound } = await import('../../src/webhooks/mitto-inbound.js');

      const inboundPayload = {
        from: phoneE164,
        text: messageText,
        timestamp: new Date().toISOString(),
      };

      const result = await processMittoInbound(inboundPayload);

      // Verify all contacts were updated
      expect(mockPrisma.contact.updateMany).toHaveBeenCalledWith({
        where: { phoneE164 },
        data: {
          optedOut: true,
          unsubscribedAt: expect.any(Date),
          smsConsentState: 'opted_out',
          smsConsentSource: 'inbound_stop',
        },
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('unsubscribe');
    });

    it('should handle database errors gracefully', async () => {
      const phoneE164 = '+1234567894';
      const messageText = 'STOP';

      mockPrisma.contact.findMany.mockRejectedValue(new Error('Database connection failed'));

      const { processMittoInbound } = await import('../../src/webhooks/mitto-inbound.js');

      const inboundPayload = {
        from: phoneE164,
        text: messageText,
        timestamp: new Date().toISOString(),
      };

      const result = await processMittoInbound(inboundPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('database_error');
    });
  });

  describe('Message Status Tracking', () => {
    it('should track message status transitions', async () => {
      const messageId = 'msg_123456791';
      const providerMsgId = 'provider_msg_126';

      // Mock message in 'sent' status
      mockPrisma.message.findFirst.mockResolvedValue({
        id: messageId,
        shopId: 'shop-123',
        contactId: 'contact-125',
        phoneE164: '+1234567895',
        body: 'Test message',
        status: 'sent',
        providerMsgId,
        sentAt: new Date(),
        deliveredAt: null,
        failedAt: null,
      });

      // Mock successful update
      mockPrisma.message.update.mockResolvedValue({
        id: messageId,
        status: 'delivered',
        deliveredAt: new Date(),
        updatedAt: new Date(),
      });

      const { processMittoDlr } = await import('../../src/webhooks/mitto-dlr.js');

      const dlrPayload = {
        message_id: providerMsgId,
        status: 'delivered',
        delivered_at: new Date().toISOString(),
      };

      const result = await processMittoDlr(dlrPayload);

      // Verify status transition from 'sent' to 'delivered'
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: messageId },
        data: {
          status: 'delivered',
          deliveredAt: expect.any(Date),
        },
      });

      expect(result.success).toBe(true);
    });

    it('should handle invalid status transitions', async () => {
      const messageId = 'msg_123456792';
      const providerMsgId = 'provider_msg_127';

      // Mock message already in 'delivered' status
      mockPrisma.message.findFirst.mockResolvedValue({
        id: messageId,
        shopId: 'shop-123',
        contactId: 'contact-126',
        phoneE164: '+1234567896',
        body: 'Test message',
        status: 'delivered',
        providerMsgId,
        sentAt: new Date(),
        deliveredAt: new Date(),
        failedAt: null,
      });

      const { processMittoDlr } = await import('../../src/webhooks/mitto-dlr.js');

      const dlrPayload = {
        message_id: providerMsgId,
        status: 'failed',
        delivered_at: null,
        error_code: 'INVALID_NUMBER',
      };

      const result = await processMittoDlr(dlrPayload);

      // Should not update already delivered message
      expect(mockPrisma.message.update).not.toHaveBeenCalled();

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_status_transition');
    });
  });
});
