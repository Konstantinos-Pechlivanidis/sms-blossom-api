// src/routes/metrics.js
// Prometheus metrics endpoint

import { Router } from 'express';
import { getPrometheusMetrics, getAllMetrics } from '../lib/metrics.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * GET /metrics - Prometheus format
 */
router.get('/', async (req, res) => {
  try {
    const metrics = getPrometheusMetrics();

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get Prometheus metrics');

    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * GET /metrics/json - JSON format
 */
router.get('/json', async (req, res) => {
  try {
    const metrics = getAllMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get JSON metrics');

    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;


