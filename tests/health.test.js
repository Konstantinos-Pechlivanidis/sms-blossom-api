// tests/health.test.js
// Health endpoint tests

import request from 'supertest';
import { app } from '../src/server.js';

describe('Health endpoint', () => {
  test('GET /health -> 200 & JSON', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    expect(res.body.status).toBe('ok');
  });
});
