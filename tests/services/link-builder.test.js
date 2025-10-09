import { describe, it, expect } from 'vitest';
import { buildDiscountUrl } from '../../src/services/link-builder.js';

describe('LinkBuilder', () => {
  describe('buildDiscountUrl', () => {
    it('should build basic discount URL', () => {
      const result = buildDiscountUrl({
        shopDomain: 'test-shop.myshopify.com',
        discountCode: 'SAVE20',
      });

      expect(result).toBe('https://test-shop.myshopify.com/discount/SAVE20?redirect=%2Fcheckout');
    });

    it('should build discount URL with custom redirect path', () => {
      const result = buildDiscountUrl({
        shopDomain: 'test-shop.myshopify.com',
        discountCode: 'SAVE20',
        redirectPath: '/products/special',
      });

      expect(result).toBe('https://test-shop.myshopify.com/discount/SAVE20?redirect=%2Fproducts%2Fspecial');
    });

    it('should build discount URL with UTM parameters', () => {
      const result = buildDiscountUrl({
        shopDomain: 'test-shop.myshopify.com',
        discountCode: 'SAVE20',
        redirectPath: '/checkout',
        utmJson: {
          source: 'sms',
          medium: 'campaign',
          campaign: 'black-friday',
          content: 'discount-link',
          term: 'savings'
        },
      });

      expect(result).toBe('https://test-shop.myshopify.com/discount/SAVE20?redirect=%2Fcheckout&utm_source=sms&utm_medium=campaign&utm_campaign=black-friday&utm_content=discount-link&utm_term=savings');
    });

    it('should build discount URL with partial UTM parameters', () => {
      const result = buildDiscountUrl({
        shopDomain: 'test-shop.myshopify.com',
        discountCode: 'SAVE20',
        redirectPath: '/checkout',
        utmJson: {
          source: 'sms',
          campaign: 'black-friday',
        },
      });

      expect(result).toBe('https://test-shop.myshopify.com/discount/SAVE20?redirect=%2Fcheckout&utm_source=sms&utm_campaign=black-friday');
    });

    it('should handle empty UTM parameters', () => {
      const result = buildDiscountUrl({
        shopDomain: 'test-shop.myshopify.com',
        discountCode: 'SAVE20',
        redirectPath: '/checkout',
        utmJson: {},
      });

      expect(result).toBe('https://test-shop.myshopify.com/discount/SAVE20?redirect=%2Fcheckout');
    });

    it('should handle undefined UTM parameters', () => {
      const result = buildDiscountUrl({
        shopDomain: 'test-shop.myshopify.com',
        discountCode: 'SAVE20',
        redirectPath: '/checkout',
      });

      expect(result).toBe('https://test-shop.myshopify.com/discount/SAVE20?redirect=%2Fcheckout');
    });

    it('should handle special characters in discount code', () => {
      const result = buildDiscountUrl({
        shopDomain: 'test-shop.myshopify.com',
        discountCode: 'SAVE-20%',
      });

      expect(result).toBe('https://test-shop.myshopify.com/discount/SAVE-20%25?redirect=%2Fcheckout');
    });

    it('should handle special characters in redirect path', () => {
      const result = buildDiscountUrl({
        shopDomain: 'test-shop.myshopify.com',
        discountCode: 'SAVE20',
        redirectPath: '/products/special-item?color=red&size=large',
      });

      expect(result).toBe('https://test-shop.myshopify.com/discount/SAVE20?redirect=%2Fproducts%2Fspecial-item%3Fcolor%3Dred%26size%3Dlarge');
    });
  });
});
