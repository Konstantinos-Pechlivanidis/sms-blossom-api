// src/metrics/index.js
// Prometheus metrics collection and registry

import client from 'prom-client';
import { logger } from '../lib/logger.js';

// Configure default metrics collection
const register = new client.Registry();
client.collectDefaultMetrics({
  register,
  prefix: 'sms_blossom_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
  eventLoopMonitoringPrecision: 10,
});

// Custom metrics for SMS Blossom
const smsSendAttempts = new client.Counter({
  name: 'sms_send_attempts_total',
  help: 'Total number of SMS send attempts',
  labelNames: ['provider', 'status'],
});

const smsDeliverySuccess = new client.Counter({
  name: 'sms_delivery_success_total',
  help: 'Total number of successful SMS deliveries',
  labelNames: ['provider'],
});

const smsDeliveryFailure = new client.Counter({
  name: 'sms_delivery_failure_total',
  help: 'Total number of failed SMS deliveries',
  labelNames: ['provider', 'error_type'],
});

const webhookEvents = new client.Counter({
  name: 'webhook_events_total',
  help: 'Total number of webhook events received',
  labelNames: ['topic', 'status'],
});

const queueJobs = new client.Counter({
  name: 'queue_jobs_total',
  help: 'Total number of queue jobs processed',
  labelNames: ['queue', 'status'],
});

const queueJobDuration = new client.Histogram({
  name: 'queue_job_duration_seconds',
  help: 'Duration of queue job processing in seconds',
  labelNames: ['queue', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

const rateLimitHits = new client.Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint', 'ip'],
});

const cacheHits = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
});

const cacheMisses = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
});

const activeConnections = new client.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  labelNames: ['type'],
});

const piiCoverage = new client.Gauge({
  name: 'pii_coverage_percentage',
  help: 'Percentage of PII data that is encrypted',
  labelNames: ['data_type'],
});

// Register custom metrics
register.registerMetric(smsSendAttempts);
register.registerMetric(smsDeliverySuccess);
register.registerMetric(smsDeliveryFailure);
register.registerMetric(webhookEvents);
register.registerMetric(queueJobs);
register.registerMetric(queueJobDuration);
register.registerMetric(rateLimitHits);
register.registerMetric(cacheHits);
register.registerMetric(cacheMisses);
register.registerMetric(activeConnections);
register.registerMetric(piiCoverage);

// Helper functions for metrics
export const metrics = {
  sms: {
    recordSendAttempt: (provider, status) => {
      smsSendAttempts.inc({ provider, status });
    },
    recordDeliverySuccess: (provider) => {
      smsDeliverySuccess.inc({ provider });
    },
    recordDeliveryFailure: (provider, errorType) => {
      smsDeliveryFailure.inc({ provider, error_type: errorType });
    },
  },

  webhooks: {
    recordEvent: (topic, status) => {
      webhookEvents.inc({ topic, status });
    },
  },

  queues: {
    recordJob: (queue, status) => {
      queueJobs.inc({ queue, status });
    },
    recordJobDuration: (queue, status, duration) => {
      queueJobDuration.observe({ queue, status }, duration);
    },
  },

  rateLimit: {
    recordHit: (endpoint, ip) => {
      rateLimitHits.inc({ endpoint, ip });
    },
  },

  cache: {
    recordHit: (cacheType) => {
      cacheHits.inc({ cache_type: cacheType });
    },
    recordMiss: (cacheType) => {
      cacheMisses.inc({ cache_type: cacheType });
    },
  },

  connections: {
    setActive: (type, count) => {
      activeConnections.set({ type }, count);
    },
  },

  pii: {
    setCoverage: (dataType, percentage) => {
      piiCoverage.set({ data_type: dataType }, percentage);
    },
  },
};

// Get metrics as text
export async function getMetrics() {
  try {
    return await register.metrics();
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to collect metrics');
    throw error;
  }
}

// Get metrics as JSON
export async function getMetricsAsJson() {
  try {
    return await register.getMetricsAsJSON();
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to collect metrics as JSON');
    throw error;
  }
}

// Clear all metrics (useful for testing)
export function clearMetrics() {
  register.clear();
}

export { register };
