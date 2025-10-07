// tests/db-schema.test.js
// Database schema validation tests

import { describe, it, expect } from 'vitest';
import { getPrismaClient } from '../src/db/prismaClient.js';

const prisma = getPrismaClient();

describe('Database Schema Validation', () => {
  describe('Required Columns Exist', () => {
    it('should have message timestamp columns', async () => {
      // Test that we can query the timestamp columns without 42703 error
      const result = await prisma.$queryRaw`
        SELECT sent_at, delivered_at, failed_at 
        FROM messages 
        LIMIT 1
      `;
      
      expect(result).toBeDefined();
    });

    it('should have contact PII encryption columns', async () => {
      // Test that we can query the PII columns without 42703 error
      const result = await prisma.$queryRaw`
        SELECT phone_hash, phone_ciphertext, phone_last4, 
               email_hash, email_ciphertext 
        FROM contacts 
        LIMIT 1
      `;
      
      expect(result).toBeDefined();
    });
  });

  describe('Prisma Client Works', () => {
    it('should be able to query messages with timestamps', async () => {
      const messages = await prisma.message.findMany({
        take: 1,
        select: {
          id: true,
          sentAt: true,
          deliveredAt: true,
          failedAt: true,
        },
      });
      
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should be able to query contacts with PII fields', async () => {
      const contacts = await prisma.contact.findMany({
        take: 1,
        select: {
          id: true,
          phone_hash: true,
          phone_ciphertext: true,
          phone_last4: true,
          email_hash: true,
          email_ciphertext: true,
        },
      });
      
      expect(Array.isArray(contacts)).toBe(true);
    });

    it('should be able to query campaigns without invalid includes', async () => {
      const campaigns = await prisma.campaign.findMany({
        take: 1,
        include: {
          shop: true,
        },
      });
      
      expect(Array.isArray(campaigns)).toBe(true);
    });
  });

  describe('Raw SQL Smoke Test', () => {
    it('should not throw 42703 on message timestamp queries', async () => {
      // This was the original error - ensure it's fixed
      const result = await prisma.$queryRaw`
        SELECT 
          COUNT(*) as total,
          COUNT(sent_at) as sent_count,
          COUNT(delivered_at) as delivered_count,
          COUNT(failed_at) as failed_count
        FROM messages
      `;
      
      expect(result[0]).toHaveProperty('total');
      expect(result[0]).toHaveProperty('sent_count');
      expect(result[0]).toHaveProperty('delivered_count');
      expect(result[0]).toHaveProperty('failed_count');
    });

    it('should not throw 42703 on contact PII queries', async () => {
      const result = await prisma.$queryRaw`
        SELECT 
          COUNT(*) as total,
          COUNT(phone_hash) as phone_hash_count,
          COUNT(phone_ciphertext) as phone_ciphertext_count,
          COUNT(email_hash) as email_hash_count,
          COUNT(email_ciphertext) as email_ciphertext_count
        FROM contacts
      `;
      
      expect(result[0]).toHaveProperty('total');
      expect(result[0]).toHaveProperty('phone_hash_count');
      expect(result[0]).toHaveProperty('phone_ciphertext_count');
      expect(result[0]).toHaveProperty('email_hash_count');
      expect(result[0]).toHaveProperty('email_ciphertext_count');
    });
  });
});
