// tests/segment-dsl-enhanced.test.js
// Tests for enhanced segment DSL with new filters

import { describe, it, expect } from 'vitest';
import { dslToWhere, evaluateSegmentFilter } from '../src/services/segment-dsl.js';

describe('dslToWhere - Enhanced Filters', () => {
  it('should handle gender filter', () => {
    const dsl = { gender: 'male' };
    const where = dslToWhere(dsl);
    expect(where).toEqual({ AND: [{ gender: 'male' }] });
  });

  it('should handle ageYears range filter', () => {
    const dsl = { ageYears: { gte: 18, lte: 65 } };
    const where = dslToWhere(dsl);
    expect(where).toEqual({ AND: [{ ageYears: { gte: 18, lte: 65 } }] });
  });

  it('should handle ageYears exact filter', () => {
    const dsl = { ageYears: 25 };
    const where = dslToWhere(dsl);
    expect(where).toEqual({ AND: [{ ageYears: 25 }] });
  });

  it('should handle conversion filter with minCount', () => {
    const dsl = { conversion: { minCount: 1 } };
    const where = dslToWhere(dsl);
    expect(where).toEqual({ AND: [{ conversionCount: { gte: 1 } }] });
  });

  it('should handle conversion filter with lastNDays', () => {
    const dsl = { conversion: { lastNDays: 90 } };
    const where = dslToWhere(dsl);
    expect(where.AND).toHaveLength(1);
    expect(where.AND[0].lastConvertedAt).toBeDefined();
    expect(where.AND[0].lastConvertedAt.gte).toBeInstanceOf(Date);
  });

  it('should handle combined conversion filters', () => {
    const dsl = { conversion: { minCount: 2, lastNDays: 30 } };
    const where = dslToWhere(dsl);
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0]).toEqual({ conversionCount: { gte: 2 } });
    expect(where.AND[1].lastConvertedAt).toBeDefined();
  });

  it('should handle complex combined filters', () => {
    const dsl = {
      and: [
        { gender: 'female' },
        { ageYears: { gte: 25, lte: 45 } },
        { conversion: { minCount: 1 } }
      ]
    };
    const where = dslToWhere(dsl);
    expect(where.AND).toHaveLength(3);
    expect(where.AND[0]).toEqual({ gender: 'female' });
    expect(where.AND[1]).toEqual({ ageYears: { gte: 25, lte: 45 } });
    expect(where.AND[2]).toEqual({ conversionCount: { gte: 1 } });
  });
});

describe('evaluateSegmentFilter - Enhanced Filters', () => {
  const mockContact = {
    id: 'contact_123',
    gender: 'female',
    ageYears: 30,
    conversionCount: 2,
    lastConvertedAt: new Date('2024-01-01'),
    smsConsentState: 'opted_in',
    optedOut: false,
    tagsJson: ['vip'],
    phoneE164: '+1234567890'
  };

  it('should evaluate gender filter correctly', () => {
    const filter = { gender: 'female' };
    expect(evaluateSegmentFilter(mockContact, filter)).toBe(true);
    
    const filter2 = { gender: 'male' };
    expect(evaluateSegmentFilter(mockContact, filter2)).toBe(false);
  });

  it('should evaluate ageYears range filter correctly', () => {
    const filter = { ageYears: { gte: 25, lte: 35 } };
    expect(evaluateSegmentFilter(mockContact, filter)).toBe(true);
    
    const filter2 = { ageYears: { gte: 40, lte: 50 } };
    expect(evaluateSegmentFilter(mockContact, filter2)).toBe(false);
  });

  it('should evaluate conversion filter correctly', () => {
    const filter = { conversionCount: { gte: 1 } };
    expect(evaluateSegmentFilter(mockContact, filter)).toBe(true);
    
    const filter2 = { conversionCount: { gte: 5 } };
    expect(evaluateSegmentFilter(mockContact, filter2)).toBe(false);
  });

  it('should evaluate lastConvertedAt filter correctly', () => {
    const recentDate = new Date('2024-01-15');
    const filter = { lastConvertedAt: recentDate };
    expect(evaluateSegmentFilter(mockContact, filter)).toBe(true);
    
    const futureDate = new Date('2025-01-01');
    const filter2 = { lastConvertedAt: futureDate };
    expect(evaluateSegmentFilter(mockContact, filter2)).toBe(false);
  });

  it('should handle null/undefined values gracefully', () => {
    const contactWithNulls = {
      ...mockContact,
      ageYears: null,
      lastConvertedAt: null
    };

    const filter = { ageYears: { gte: 25 } };
    expect(evaluateSegmentFilter(contactWithNulls, filter)).toBe(false);
    
    const filter2 = { lastConvertedAt: new Date() };
    expect(evaluateSegmentFilter(contactWithNulls, filter2)).toBe(false);
  });
});
