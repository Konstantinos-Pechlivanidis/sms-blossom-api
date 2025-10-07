// src/routes/metrics.js
// Prometheus metrics endpoint

import { Router } from 'express';
import { getMetrics, getMetricsAsJson } from '../metrics/index.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Middleware to check metrics token if configured
function checkMetricsAuth(req, res, next) {
  const metricsToken = process.env.METRICS_TOKEN;

  if (!metricsToken) {
    // No token configured, allow access
    return next();
  }

  const authHeader = req.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing or invalid Authorization header',
      message: 'Use: Authorization: Bearer <METRICS_TOKEN>',
    });
  }

  const token = authHeader.substring(7);
  if (token !== metricsToken) {
    return res.status(401).json({
      error: 'Invalid metrics token',
    });
  }

  next();
}

// Prometheus metrics endpoint
router.get('/', checkMetricsAuth, async (req, res) => {
  const requestId = req.get('x-request-id') || 'unknown';

  try {
    const metrics = await getMetrics();

    res.set({
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });

    res.send(metrics);

    logger.debug({ request_id: requestId }, 'Metrics endpoint accessed');
  } catch (error) {
    logger.error({ error: error.message, request_id: requestId }, 'Metrics collection failed');
    res.status(500).json({
      error: 'Metrics collection failed',
      request_id: requestId,
    });
  }
});

// JSON metrics endpoint (for debugging)
router.get('/json', checkMetricsAuth, async (req, res) => {
  const requestId = req.get('x-request-id') || 'unknown';

  try {
    const metrics = await getMetricsAsJson();

    res.json({
      metrics,
      timestamp: new Date().toISOString(),
      request_id: requestId,
    });

    logger.debug({ request_id: requestId }, 'JSON metrics endpoint accessed');
  } catch (error) {
    logger.error({ error: error.message, request_id: requestId }, 'JSON metrics collection failed');
    res.status(500).json({
      error: 'JSON metrics collection failed',
      request_id: requestId,
    });
  }
});

// Health check for metrics endpoint
router.get('/health', (req, res) => {
  const requestId = req.get('x-request-id') || 'unknown';

  res.json({
    status: 'ok',
    endpoint: '/metrics',
    auth_required: !!process.env.METRICS_TOKEN,
    timestamp: new Date().toISOString(),
    request_id: requestId,
  });
});

export default router;
