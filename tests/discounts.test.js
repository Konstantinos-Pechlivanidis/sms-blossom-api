// tests/discounts.test.js
// Discounts service tests

import { buildApplyUrl } from '../src/services/discounts.js';

describe('Discounts.buildApplyUrl', () => {
  test('builds canonical apply URL', () => {
    const url = buildApplyUrl({
      shopDomain: 'example.myshopify.com',
      code: 'WELCOME10',
      redirect: '/checkout',
    });
    expect(url).toBe('https://example.myshopify.com/discount/WELCOME10?redirect=%2Fcheckout');
  });
});
