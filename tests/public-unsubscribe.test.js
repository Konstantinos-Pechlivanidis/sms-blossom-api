// tests/public-unsubscribe.test.js
// Tests for public unsubscribe HTML confirmation

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import unsubscribeRouter from '../src/proxy/unsubscribe.js';
import publicUnsubscribe from '../src/routes/public-unsubscribe.js';

// Mock dependencies
vi.mock('../src/db/prismaClient.js', () => ({
  getPrismaClient: vi.fn(() => ({
    shop: {
      findUnique: vi.fn(),
    },
    contact: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  })),
}));

vi.mock('../src/lib/phone.js', () => ({
  toE164Loose: vi.fn((phone) => phone),
}));

vi.mock('../src/services/consent.js', () => ({
  updateSmsConsent: vi.fn(),
}));

vi.mock('../src/services/consent-unified.js', () => ({
  updateLocalAndRemoteConsent: vi.fn(),
}));

describe('Public Unsubscribe HTML Confirmation', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/proxy/unsubscribe', unsubscribeRouter);
    app.use('/public/unsubscribe', publicUnsubscribe);
  });

  describe('Proxy Unsubscribe Route', () => {
    it('should return HTML when Accept: text/html', async () => {
      const response = await request(app)
        .get('/proxy/unsubscribe')
        .query({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678',
          timestamp: '1234567890',
          signature: 'valid-signature',
        })
        .set('Accept', 'text/html')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('Successfully Unsubscribed');
      expect(response.text).toContain('You have been unsubscribed from SMS marketing messages');
    });

    it('should return Greek HTML when Accept: text/html and no specific language', async () => {
      const response = await request(app)
        .get('/proxy/unsubscribe')
        .query({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678',
          timestamp: '1234567890',
          signature: 'valid-signature',
        })
        .set('Accept', 'application/json')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('Επιτυχής απεγγραφή από SMS');
    });
  });

  describe('Public Unsubscribe Route', () => {
    it('should return HTML when Accept: text/html', async () => {
      const response = await request(app)
        .get('/public/unsubscribe')
        .query({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678',
        })
        .set('Accept', 'text/html')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('Successfully Unsubscribed');
      expect(response.text).toContain('You have been unsubscribed from SMS marketing messages');
    });

    it('should return JSON when Accept: application/json', async () => {
      const response = await request(app)
        .get('/public/unsubscribe')
        .query({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678',
        })
        .set('Accept', 'application/json')
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('unsubscribed_at');
    });

    it('should return HTML by default when no Accept header', async () => {
      const response = await request(app)
        .get('/public/unsubscribe')
        .query({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678',
        })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('<!DOCTYPE html>');
    });
  });

  describe('HTML Content Validation', () => {
    it('should include proper HTML structure', async () => {
      const response = await request(app)
        .get('/public/unsubscribe')
        .query({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678',
        })
        .set('Accept', 'text/html')
        .expect(200);

      const html = response.text;

      // Check for proper HTML structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<head>');
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('<title>Unsubscribed from SMS</title>');
      expect(html).toContain('<body>');
      expect(html).toContain('</body>');
      expect(html).toContain('</html>');
    });

    it('should include responsive CSS', async () => {
      const response = await request(app)
        .get('/public/unsubscribe')
        .query({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678',
        })
        .set('Accept', 'text/html')
        .expect(200);

      const html = response.text;

      // Check for CSS styles
      expect(html).toContain('<style>');
      expect(html).toContain('font-family: -apple-system');
      expect(html).toContain('max-width: 500px');
      expect(html).toContain('border-radius: 8px');
      expect(html).toContain('box-shadow: 0 2px 10px');
    });

    it('should include accessibility features', async () => {
      const response = await request(app)
        .get('/public/unsubscribe')
        .query({
          shop: 'test-shop.myshopify.com',
          phone: '+306912345678',
        })
        .set('Accept', 'text/html')
        .expect(200);

      const html = response.text;

      // Check for accessibility features
      expect(html).toContain('lang="en"');
      expect(html).toContain('✓ Successfully Unsubscribed');
      expect(html).toContain('You have been unsubscribed from SMS marketing messages');
    });
  });
});
