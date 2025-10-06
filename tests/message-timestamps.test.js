import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPrismaClient } from '../src/db/prismaClient.js';
import { getOverview, getMessagingTimeseries } from '../src/services/reports.js';

const prisma = getPrismaClient();

describe('Message Timestamps Integration', () => {
  let testShopId;
  let testContactId;
  let testMessageId;

  beforeAll(async () => {
    // Create a test shop
    const shop = await prisma.shop.create({
      data: {
        domain: 'test-timestamps.myshopify.com',
        name: 'Test Timestamps Shop',
      },
    });
    testShopId = shop.id;

    // Create a test contact
    const contact = await prisma.contact.create({
      data: {
        shopId: testShopId,
        phoneE164: '+9995550123456',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        optedOut: false,
      },
    });
    testContactId = contact.id;

    // Create a test message with timestamps
    const message = await prisma.message.create({
      data: {
        shopId: testShopId,
        contactId: testContactId,
        body: 'Test message with timestamps',
        provider: 'mitto',
        status: 'delivered',
        kind: 'automation',
        triggerKey: 'test',
        sentAt: new Date('2024-01-01T10:00:00Z'),
        deliveredAt: new Date('2024-01-01T10:00:05Z'),
        failedAt: null,
        metadata: { test: true },
      },
    });
    testMessageId = message.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.message.deleteMany({ where: { shopId: testShopId } });
    await prisma.contact.deleteMany({ where: { shopId: testShopId } });
    await prisma.shop.delete({ where: { id: testShopId } });
    await prisma.$disconnect();
  });

  it('should not throw 42703 error when querying message timestamps', async () => {
    // This test ensures that the 42703 "column does not exist" error is fixed
    const from = new Date('2024-01-01T00:00:00Z');
    const to = new Date('2024-01-02T00:00:00Z');

    // Test that Prisma queries work with timestamp fields
    const messages = await prisma.message.findMany({
      where: {
        shopId: testShopId,
        sentAt: { gte: from, lt: to },
      },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].sentAt).toBeDefined();
    expect(messages[0].deliveredAt).toBeDefined();
  });

  it('should handle null timestamps gracefully', async () => {
    // Create a message with null timestamps
    const message = await prisma.message.create({
      data: {
        shopId: testShopId,
        contactId: testContactId,
        body: 'Test message with null timestamps',
        provider: 'mitto',
        status: 'queued',
        kind: 'automation',
        sentAt: null,
        deliveredAt: null,
        failedAt: null,
      },
    });

    // Query should not fail with null timestamps
    const messages = await prisma.message.findMany({
      where: {
        shopId: testShopId,
        sentAt: null,
      },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].sentAt).toBeNull();
  });

  it('should work with reports overview without 42703 error', async () => {
    const from = new Date('2024-01-01T00:00:00Z');
    const to = new Date('2024-01-02T00:00:00Z');

    // This should not throw 42703 error
    const overview = await getOverview({ shopId: testShopId, from, to });

    expect(overview).toBeDefined();
    expect(typeof overview.sent).toBe('number');
    expect(typeof overview.delivered).toBe('number');
    expect(typeof overview.failed).toBe('number');
  });

  it('should work with messaging timeseries without 42703 error', async () => {
    const from = new Date('2024-01-01T00:00:00Z');
    const to = new Date('2024-01-02T00:00:00Z');

    // This should not throw 42703 error
    const timeseries = await getMessagingTimeseries({ shopId: testShopId, from, to });

    expect(Array.isArray(timeseries)).toBe(true);
  });

  it('should verify database columns exist', async () => {
    // Test that we can query the actual database columns
    const result = await prisma.$queryRaw`
      SELECT sent_at, delivered_at, failed_at 
      FROM "Message" 
      WHERE "id" = ${testMessageId}
    `;

    expect(result).toHaveLength(1);
    expect(result[0].sent_at).toBeDefined();
    expect(result[0].delivered_at).toBeDefined();
    expect(result[0].failed_at).toBeNull();
  });
});
