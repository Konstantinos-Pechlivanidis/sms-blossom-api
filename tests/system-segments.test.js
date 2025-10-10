// tests/system-segments.test.js
// Tests for system segments functionality

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSystemSegments, getSystemSegments, deleteSystemSegments } from '../src/services/system-segments.js';
import { getPrismaClient } from '../src/db/prismaClient.js';

const prisma = getPrismaClient();

describe('System Segments', () => {
  let testShopId;

  beforeEach(async () => {
    // Create a test shop
    const shop = await prisma.shop.create({
      data: { domain: 'test-shop.myshopify.com' }
    });
    testShopId = shop.id;
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.segment.deleteMany({
      where: { shopId: testShopId }
    });
    await prisma.shop.delete({
      where: { id: testShopId }
    });
  });

  describe('createSystemSegments', () => {
    it('should create all system segments', async () => {
      const result = await createSystemSegments(testShopId);
      
      expect(result.created).toBe(8); // 2 gender + 5 age + 2 conversion
      expect(result.updated).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should update existing segments on second run', async () => {
      // First run
      await createSystemSegments(testShopId);
      
      // Second run
      const result = await createSystemSegments(testShopId);
      
      expect(result.created).toBe(0);
      expect(result.updated).toBe(8);
      expect(result.errors).toBe(0);
    });

    it('should create segments with correct properties', async () => {
      await createSystemSegments(testShopId);
      
      const segments = await prisma.segment.findMany({
        where: { shopId: testShopId, isSystem: true }
      });

      expect(segments).toHaveLength(8);
      
      // Check gender segments
      const maleSegment = segments.find(s => s.slug === 'male');
      expect(maleSegment).toBeDefined();
      expect(maleSegment.name).toBe('Male Customers');
      expect(maleSegment.filterJson).toEqual({ gender: 'male' });
      expect(maleSegment.isSystem).toBe(true);

      // Check age segment
      const ageSegment = segments.find(s => s.slug === 'age_18_24');
      expect(ageSegment).toBeDefined();
      expect(ageSegment.name).toBe('Age 18-24');
      expect(ageSegment.filterJson).toEqual({ ageYears: { gte: 18, lte: 24 } });

      // Check conversion segment
      const conversionSegment = segments.find(s => s.slug === 'converted_last_90d');
      expect(conversionSegment).toBeDefined();
      expect(conversionSegment.name).toBe('Converted Last 90 Days');
      expect(conversionSegment.filterJson).toEqual({ conversion: { lastNDays: 90, minCount: 1 } });
    });
  });

  describe('getSystemSegments', () => {
    it('should return system segments for a shop', async () => {
      await createSystemSegments(testShopId);
      
      const segments = await getSystemSegments(testShopId);
      
      expect(segments).toHaveLength(8);
      expect(segments.every(s => s.isSystem)).toBe(true);
      expect(segments.every(s => s.slug)).toBe(true);
    });

    it('should return empty array for shop with no system segments', async () => {
      const segments = await getSystemSegments(testShopId);
      expect(segments).toHaveLength(0);
    });
  });

  describe('deleteSystemSegments', () => {
    it('should delete all system segments', async () => {
      await createSystemSegments(testShopId);
      
      const deletedCount = await deleteSystemSegments(testShopId);
      
      expect(deletedCount).toBe(8);
      
      const remainingSegments = await prisma.segment.findMany({
        where: { shopId: testShopId, isSystem: true }
      });
      expect(remainingSegments).toHaveLength(0);
    });

    it('should return 0 for shop with no system segments', async () => {
      const deletedCount = await deleteSystemSegments(testShopId);
      expect(deletedCount).toBe(0);
    });
  });
});
