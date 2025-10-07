import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { campaignsRouter } from '../../src/routes/campaigns.js';
import { generateJwtToken } from '../../src/middleware/auth.js';

/**
 * Contract tests for /campaigns endpoints
 * Validates CRUD operations and response schemas
 */
describe('Campaigns Contract Tests', () => {
  let app;
  let authToken;
  let testCampaignId;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Mock auth and shop scoping
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

    app.use('/campaigns', campaignsRouter);
  });

  beforeEach(() => {
    authToken = generateJwtToken({
      shop_domain: 'test-shop.myshopify.com',
      user_id: 'test-user-123',
    });
  });

  it('should create campaign with valid payload', async () => {
    const campaignPayload = {
      name: 'Test Campaign',
      description: 'Test campaign for contract testing',
      segmentId: 'segment-123',
      templateId: 'template-123',
      discountId: 'discount-123',
      scheduleAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      batchSize: 100,
      utmSource: 'sms',
      utmMedium: 'sms',
      utmCampaign: 'test_campaign',
    };

    const response = await request(app)
      .post('/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .send(campaignPayload)
      .expect(201);

    // Validate response structure
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('name');
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('createdAt');
    expect(response.body).toHaveProperty('updatedAt');

    // Store for subsequent tests
    testCampaignId = response.body.id;

    // Validate field types
    expect(typeof response.body.id).toBe('string');
    expect(typeof response.body.name).toBe('string');
    expect(typeof response.body.status).toBe('string');
    expect(['draft', 'scheduled', 'sending', 'paused', 'completed', 'failed']).toContain(
      response.body.status,
    );
  });

  it('should get campaign by ID', async () => {
    if (!testCampaignId) {
      // Create a campaign first if not exists
      const campaignPayload = {
        name: 'Test Campaign for Get',
        segmentId: 'segment-123',
        templateId: 'template-123',
      };

      const createResponse = await request(app)
        .post('/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send(campaignPayload)
        .expect(201);

      testCampaignId = createResponse.body.id;
    }

    const response = await request(app)
      .get(`/campaigns/${testCampaignId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Validate response structure
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('name');
    expect(response.body).toHaveProperty('status');
    expect(response.body.id).toBe(testCampaignId);
  });

  it('should list campaigns with pagination', async () => {
    const response = await request(app)
      .get('/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .query({
        page: 1,
        limit: 10,
        sort: 'createdAt',
        order: 'desc',
      })
      .expect(200);

    // Validate response structure
    expect(response.body).toHaveProperty('campaigns');
    expect(response.body).toHaveProperty('pagination');
    expect(Array.isArray(response.body.campaigns)).toBe(true);

    // Validate pagination structure
    expect(response.body.pagination).toHaveProperty('page');
    expect(response.body.pagination).toHaveProperty('limit');
    expect(response.body.pagination).toHaveProperty('total');
    expect(response.body.pagination).toHaveProperty('pages');

    // Validate pagination types
    expect(typeof response.body.pagination.page).toBe('number');
    expect(typeof response.body.pagination.limit).toBe('number');
    expect(typeof response.body.pagination.total).toBe('number');
    expect(typeof response.body.pagination.pages).toBe('number');
  });

  it('should estimate campaign recipients and cost', async () => {
    if (!testCampaignId) {
      // Create a campaign first if not exists
      const campaignPayload = {
        name: 'Test Campaign for Estimate',
        segmentId: 'segment-123',
        templateId: 'template-123',
      };

      const createResponse = await request(app)
        .post('/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send(campaignPayload)
        .expect(201);

      testCampaignId = createResponse.body.id;
    }

    const response = await request(app)
      .post(`/campaigns/${testCampaignId}/estimate`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Validate response structure
    expect(response.body).toHaveProperty('recipientCount');
    expect(response.body).toHaveProperty('estimatedCost');
    expect(response.body).toHaveProperty('smsParts');
    expect(response.body).toHaveProperty('currency');

    // Validate field types
    expect(typeof response.body.recipientCount).toBe('number');
    expect(typeof response.body.estimatedCost).toBe('number');
    expect(typeof response.body.smsParts).toBe('number');
    expect(typeof response.body.currency).toBe('string');
  });

  it('should test send campaign to phone number', async () => {
    if (!testCampaignId) {
      // Create a campaign first if not exists
      const campaignPayload = {
        name: 'Test Campaign for Test Send',
        segmentId: 'segment-123',
        templateId: 'template-123',
      };

      const createResponse = await request(app)
        .post('/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send(campaignPayload)
        .expect(201);

      testCampaignId = createResponse.body.id;
    }

    const testSendPayload = {
      phoneE164: '+1234567890',
      testMessage: 'This is a test message',
    };

    const response = await request(app)
      .post(`/campaigns/${testCampaignId}/test-send`)
      .set('Authorization', `Bearer ${authToken}`)
      .send(testSendPayload)
      .expect(200);

    // Validate response structure
    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('messageId');
    expect(response.body).toHaveProperty('status');

    // Validate field types
    expect(typeof response.body.success).toBe('boolean');
    expect(typeof response.body.messageId).toBe('string');
    expect(typeof response.body.status).toBe('string');
  });

  it('should send campaign to audience', async () => {
    if (!testCampaignId) {
      // Create a campaign first if not exists
      const campaignPayload = {
        name: 'Test Campaign for Send',
        segmentId: 'segment-123',
        templateId: 'template-123',
      };

      const createResponse = await request(app)
        .post('/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send(campaignPayload)
        .expect(201);

      testCampaignId = createResponse.body.id;
    }

    const response = await request(app)
      .post(`/campaigns/${testCampaignId}/send`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Validate response structure
    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('jobId');

    // Validate field types
    expect(typeof response.body.success).toBe('boolean');
    expect(typeof response.body.message).toBe('string');
    expect(typeof response.body.jobId).toBe('string');
  });

  it('should get campaign apply URL', async () => {
    if (!testCampaignId) {
      // Create a campaign first if not exists
      const campaignPayload = {
        name: 'Test Campaign for Apply URL',
        segmentId: 'segment-123',
        templateId: 'template-123',
        discountId: 'discount-123',
      };

      const createResponse = await request(app)
        .post('/campaigns')
        .set('Authorization', `Bearer ${authToken}`)
        .send(campaignPayload)
        .expect(201);

      testCampaignId = createResponse.body.id;
    }

    const response = await request(app)
      .get(`/campaigns/${testCampaignId}/apply-url`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Validate response structure
    expect(response.body).toHaveProperty('applyUrl');
    expect(response.body).toHaveProperty('utmParams');

    // Validate field types
    expect(typeof response.body.applyUrl).toBe('string');
    expect(typeof response.body.utmParams).toBe('object');

    // Validate URL format
    expect(response.body.applyUrl).toMatch(/^https?:\/\//);
  });

  it('should reject invalid campaign payload', async () => {
    const invalidPayload = {
      name: '', // Invalid: empty name
      segmentId: 'invalid-uuid', // Invalid: not a UUID
      templateId: 'invalid-uuid', // Invalid: not a UUID
    };

    const response = await request(app)
      .post('/campaigns')
      .set('Authorization', `Bearer ${authToken}`)
      .send(invalidPayload)
      .expect(400);

    // Validate error response structure
    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('details');
    expect(response.body.error).toBe('validation_failed');
  });

  it('should require authentication for all endpoints', async () => {
    const endpoints = [
      { method: 'get', path: '/campaigns' },
      { method: 'post', path: '/campaigns' },
      { method: 'get', path: '/campaigns/test-id' },
      { method: 'post', path: '/campaigns/test-id/estimate' },
      { method: 'post', path: '/campaigns/test-id/test-send' },
      { method: 'post', path: '/campaigns/test-id/send' },
    ];

    for (const endpoint of endpoints) {
      const response = await request(app)[endpoint.method](endpoint.path).expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('unauthorized');
    }
  });
});
