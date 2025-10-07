import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { settingsRouter } from '../../src/routes/settings.js';
import { generateJwtToken } from '../../src/middleware/auth.js';

/**
 * Contract tests for /settings endpoints
 * Validates request/response schemas match OpenAPI
 */
describe('Settings Contract Tests', () => {
  let app;
  let authToken;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Mock auth and shop scoping for tests
    app.use((req, res, next) => {
      req.auth = {
        shop_domain: 'test-shop.myshopify.com',
        user_id: 'test-user-123',
      };
      req.shop = {
        id: 'test-shop-123',
        domain: 'test-shop.myshopify.com',
        tz: 'America/New_York',
        locale: 'en',
      };
      next();
    });

    app.use('/settings', settingsRouter);
  });

  beforeEach(() => {
    authToken = generateJwtToken({
      shop_domain: 'test-shop.myshopify.com',
      user_id: 'test-user-123',
    });
  });

  it('should get settings with correct schema', async () => {
    const response = await request(app)
      .get('/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Validate response structure
    expect(response.body).toHaveProperty('shop');
    expect(response.body).toHaveProperty('automations');
    expect(response.body).toHaveProperty('templates');
    expect(response.body).toHaveProperty('segments');

    // Validate shop object
    expect(response.body.shop).toHaveProperty('domain');
    expect(response.body.shop).toHaveProperty('timezone');
    expect(response.body.shop).toHaveProperty('locale');
    expect(response.body.shop).toHaveProperty('currency');

    // Validate automations array
    expect(Array.isArray(response.body.automations)).toBe(true);

    // Validate templates array
    expect(Array.isArray(response.body.templates)).toBe(true);

    // Validate segments array
    expect(Array.isArray(response.body.segments)).toBe(true);
  });

  it('should update settings with valid payload', async () => {
    const updatePayload = {
      shop: {
        timezone: 'America/Los_Angeles',
        locale: 'en-US',
        currency: 'USD',
      },
      automations: [
        {
          trigger: 'abandoned_checkout',
          isActive: true,
          delayMinutes: 30,
        },
      ],
    };

    const response = await request(app)
      .put('/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updatePayload)
      .expect(200);

    // Validate response structure
    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('message');
    expect(response.body.success).toBe(true);
  });

  it('should reject invalid settings payload', async () => {
    const invalidPayload = {
      shop: {
        timezone: 'Invalid/Timezone', // Invalid timezone
        locale: 'invalid-locale', // Invalid locale
        currency: 'INVALID', // Invalid currency
      },
    };

    const response = await request(app)
      .put('/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send(invalidPayload)
      .expect(400);

    // Validate error response structure
    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('details');
  });

  it('should require authentication', async () => {
    const response = await request(app).get('/settings').expect(401);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('unauthorized');
  });

  it('should validate automation settings', async () => {
    const validAutomationPayload = {
      automations: [
        {
          trigger: 'abandoned_checkout',
          isActive: true,
          delayMinutes: 30,
          templateId: 'template-123',
          segmentId: 'segment-123',
        },
      ],
    };

    const response = await request(app)
      .put('/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send(validAutomationPayload)
      .expect(200);

    expect(response.body.success).toBe(true);
  });

  it('should reject invalid automation trigger', async () => {
    const invalidAutomationPayload = {
      automations: [
        {
          trigger: 'invalid_trigger', // Invalid trigger
          isActive: true,
          delayMinutes: 30,
        },
      ],
    };

    const response = await request(app)
      .put('/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send(invalidAutomationPayload)
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('validation_failed');
  });
});
