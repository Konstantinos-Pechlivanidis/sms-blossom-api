// src/lib/metrics.js
// Prometheus metrics for observability

import { logger } from './logger.js';

// Simple in-memory metrics store (in production, use prom-client)
const metrics = {
  sms_send_attempts: { total: 0, by_status: {} },
  sms_send_errors: { total: 0, by_type: {} },
  sms_delivery_success: { total: 0, by_provider: {} },
  queue_job_duration: { total: 0, by_queue: {} },
  queue_job_count: { total: 0, by_queue: {} },
  cache_hits: { total: 0, by_type: {} },
  cache_misses: { total: 0, by_type: {} },
};

/**
 * Increment SMS send attempts counter
 */
export function incrementSmsSendAttempts(status = 'unknown') {
  metrics.sms_send_attempts.total++;
  metrics.sms_send_attempts.by_status[status] =
    (metrics.sms_send_attempts.by_status[status] || 0) + 1;

  logger.info({ status, total: metrics.sms_send_attempts.total }, 'SMS send attempt recorded');
}

/**
 * Increment SMS send errors counter
 */
export function incrementSmsSendErrors(errorType = 'unknown') {
  metrics.sms_send_errors.total++;
  metrics.sms_send_errors.by_type[errorType] =
    (metrics.sms_send_errors.by_type[errorType] || 0) + 1;

  logger.warn({ errorType, total: metrics.sms_send_errors.total }, 'SMS send error recorded');
}

/**
 * Increment SMS delivery success counter
 */
export function incrementSmsDeliverySuccess(provider = 'mitto') {
  metrics.sms_delivery_success.total++;
  metrics.sms_delivery_success.by_provider[provider] =
    (metrics.sms_delivery_success.by_provider[provider] || 0) + 1;

  logger.info(
    { provider, total: metrics.sms_delivery_success.total },
    'SMS delivery success recorded',
  );
}

/**
 * Record queue job duration
 */
export function recordQueueJobDuration(queueName, durationMs) {
  metrics.queue_job_duration.total += durationMs;
  metrics.queue_job_duration.by_queue[queueName] =
    (metrics.queue_job_duration.by_queue[queueName] || 0) + durationMs;

  logger.info(
    { queueName, durationMs, total: metrics.queue_job_duration.total },
    'Queue job duration recorded',
  );
}

/**
 * Increment queue job count
 */
export function incrementQueueJobCount(queueName) {
  metrics.queue_job_count.total++;
  metrics.queue_job_count.by_queue[queueName] =
    (metrics.queue_job_count.by_queue[queueName] || 0) + 1;

  logger.info({ queueName, total: metrics.queue_job_count.total }, 'Queue job count recorded');
}

/**
 * Record cache hit
 */
export function recordCacheHit(cacheType) {
  metrics.cache_hits.total++;
  metrics.cache_hits.by_type[cacheType] = (metrics.cache_hits.by_type[cacheType] || 0) + 1;

  logger.debug({ cacheType, total: metrics.cache_hits.total }, 'Cache hit recorded');
}

/**
 * Record cache miss
 */
export function recordCacheMiss(cacheType) {
  metrics.cache_misses.total++;
  metrics.cache_misses.by_type[cacheType] = (metrics.cache_misses.by_type[cacheType] || 0) + 1;

  logger.debug({ cacheType, total: metrics.cache_misses.total }, 'Cache miss recorded');
}

/**
 * Get all metrics
 */
export function getAllMetrics() {
  return {
    ...metrics,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get metrics in Prometheus format
 */
export function getPrometheusMetrics() {
  const lines = [];

  // SMS send attempts
  lines.push(`# HELP sms_send_attempts_total Total SMS send attempts`);
  lines.push(`# TYPE sms_send_attempts_total counter`);
  lines.push(`sms_send_attempts_total ${metrics.sms_send_attempts.total}`);

  Object.entries(metrics.sms_send_attempts.by_status).forEach(([status, count]) => {
    lines.push(`sms_send_attempts_by_status{status="${status}"} ${count}`);
  });

  // SMS send errors
  lines.push(`# HELP sms_send_errors_total Total SMS send errors`);
  lines.push(`# TYPE sms_send_errors_total counter`);
  lines.push(`sms_send_errors_total ${metrics.sms_send_errors.total}`);

  Object.entries(metrics.sms_send_errors.by_type).forEach(([type, count]) => {
    lines.push(`sms_send_errors_by_type{type="${type}"} ${count}`);
  });

  // SMS delivery success
  lines.push(`# HELP sms_delivery_success_total Total successful SMS deliveries`);
  lines.push(`# TYPE sms_delivery_success_total counter`);
  lines.push(`sms_delivery_success_total ${metrics.sms_delivery_success.total}`);

  Object.entries(metrics.sms_delivery_success.by_provider).forEach(([provider, count]) => {
    lines.push(`sms_delivery_success_by_provider{provider="${provider}"} ${count}`);
  });

  // Queue job duration
  lines.push(`# HELP queue_job_duration_ms_total Total queue job duration in milliseconds`);
  lines.push(`# TYPE queue_job_duration_ms_total counter`);
  lines.push(`queue_job_duration_ms_total ${metrics.queue_job_duration.total}`);

  Object.entries(metrics.queue_job_duration.by_queue).forEach(([queue, duration]) => {
    lines.push(`queue_job_duration_ms_by_queue{queue="${queue}"} ${duration}`);
  });

  // Queue job count
  lines.push(`# HELP queue_job_count_total Total queue jobs processed`);
  lines.push(`# TYPE queue_job_count_total counter`);
  lines.push(`queue_job_count_total ${metrics.queue_job_count.total}`);

  Object.entries(metrics.queue_job_count.by_queue).forEach(([queue, count]) => {
    lines.push(`queue_job_count_by_queue{queue="${queue}"} ${count}`);
  });

  // Cache hits
  lines.push(`# HELP cache_hits_total Total cache hits`);
  lines.push(`# TYPE cache_hits_total counter`);
  lines.push(`cache_hits_total ${metrics.cache_hits.total}`);

  Object.entries(metrics.cache_hits.by_type).forEach(([type, count]) => {
    lines.push(`cache_hits_by_type{type="${type}"} ${count}`);
  });

  // Cache misses
  lines.push(`# HELP cache_misses_total Total cache misses`);
  lines.push(`# TYPE cache_misses_total counter`);
  lines.push(`cache_misses_total ${metrics.cache_misses.total}`);

  Object.entries(metrics.cache_misses.by_type).forEach(([type, count]) => {
    lines.push(`cache_misses_by_type{type="${type}"} ${count}`);
  });

  return lines.join('\n') + '\n';
}

/**
 * Reset all metrics
 */
export function resetMetrics() {
  Object.keys(metrics).forEach((key) => {
    if (typeof metrics[key] === 'object' && metrics[key].total !== undefined) {
      metrics[key].total = 0;
      if (metrics[key].by_status) metrics[key].by_status = {};
      if (metrics[key].by_type) metrics[key].by_type = {};
      if (metrics[key].by_provider) metrics[key].by_provider = {};
      if (metrics[key].by_queue) metrics[key].by_queue = {};
    }
  });

  logger.info('Metrics reset');
}
