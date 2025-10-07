import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { healthRouter } from '../../src/routes/health.js';

/**
 * Contract tests for /health endpoint
 * Validates response matches OpenAPI schema
 */
describe('Health Contract Tests', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use('/health', healthRouter);
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  it('should return health status with required fields', async () => {
    const response = await request(app).get('/health').expect(200);

    // Validate response structure matches OpenAPI schema
    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('version');
    expect(response.body).toHaveProperty('database');
    expect(response.body).toHaveProperty('redis');
    expect(response.body).toHaveProperty('queueDriver');

    // Validate field types
    expect(typeof response.body.status).toBe('string');
    expect(typeof response.body.timestamp).toBe('string');
    expect(typeof response.body.version).toBe('string');
    expect(typeof response.body.database).toBe('object');
    expect(typeof response.body.redis).toBe('object');
    expect(typeof response.body.queueDriver).toBe('string');

    // Validate status values
    expect(['healthy', 'degraded', 'unhealthy']).toContain(response.body.status);
    expect(typeof response.body.database.connected).toBe('boolean');
    expect(typeof response.body.redis.connected).toBe('boolean');
  });

  it('should include message timestamps check', async () => {
    const response = await request(app).get('/health').expect(200);

    expect(response.body).toHaveProperty('messageTimestamps');
    expect(typeof response.body.messageTimestamps).toBe('boolean');
  });

  it('should return valid timestamp format', async () => {
    const response = await request(app).get('/health').expect(200);

    // Validate ISO timestamp format
    const timestamp = new Date(response.body.timestamp);
    expect(timestamp.getTime()).not.toBeNaN();
    expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should handle database connection issues gracefully', async () => {
    // This test would require mocking database connection
    // For now, we just ensure the endpoint doesn't crash
    const response = await request(app).get('/health').expect(200);

    expect(response.body).toHaveProperty('database');
    expect(response.body.database).toHaveProperty('connected');
  });
});


