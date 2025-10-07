import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { checkRedisHealth } from '../queue/queues.js';
import { logger } from '../lib/logger.js';

const router = Router();
const prisma = getPrismaClient();

// Helper function to run with timeout
async function withTimeout(promise, timeoutMs, operation) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  const startTime = Date.now();
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    const latency = Date.now() - startTime;
    return { result, latency };
  } catch (error) {
    const latency = Date.now() - startTime;
    throw { error, latency };
  }
}

// Database health check with timeout
async function checkDatabaseHealth() {
  try {
    const { result, latency } = await withTimeout(
      prisma.$queryRaw`SELECT 1 as health_check`,
      800,
      'Database health check',
    );
    return { ok: true, latency_ms: latency };
  } catch ({ error, latency }) {
    logger.warn({ error: error.message, latency_ms: latency }, 'Database health check failed');
    return { ok: false, latency_ms: latency };
  }
}

// Redis health check with timeout
async function checkRedisHealthWithTimeout() {
  try {
    const { result, latency } = await withTimeout(checkRedisHealth(), 800, 'Redis health check');
    return { ok: result, latency_ms: latency };
  } catch ({ error, latency }) {
    logger.warn({ error: error.message, latency_ms: latency }, 'Redis health check failed');
    return { ok: false, latency_ms: latency };
  }
}

// PII coverage check with timeout
async function checkPiiCoverage() {
  try {
    const { result, latency } = await withTimeout(
      Promise.all([
        prisma.$queryRaw`SELECT COUNT(*) as total, COUNT(phone_ciphertext) as encrypted FROM "Contact"`,
        prisma.$queryRaw`SELECT COUNT(*) as total, COUNT(email_ciphertext) as encrypted FROM "Contact"`,
      ]),
      250,
      'PII coverage check',
    );

    const [phoneResult, emailResult] = result;
    const phonePct =
      phoneResult[0]?.total > 0
        ? Math.round((phoneResult[0].encrypted / phoneResult[0].total) * 100)
        : null;
    const emailPct =
      emailResult[0]?.total > 0
        ? Math.round((emailResult[0].encrypted / emailResult[0].total) * 100)
        : null;

    return { phone_pct: phonePct, email_pct: emailPct };
  } catch ({ error, latency }) {
    logger.warn({ error: error.message, latency_ms: latency }, 'PII coverage check failed');
    return { phone_pct: null, email_pct: null };
  }
}

// Queue health summary
async function checkQueueHealth() {
  try {
    // For now, just check if queue driver is configured
    const queueDriver = process.env.QUEUE_DRIVER || 'memory';
    const workers = queueDriver === 'redis' ? 1 : 0; // Placeholder
    return { ok: true, workers };
  } catch (error) {
    logger.warn({ error: error.message }, 'Queue health check failed');
    return { ok: false, workers: 0 };
  }
}

router.get('/', async (req, res) => {
  const requestId = req.get('x-request-id') || 'unknown';

  try {
    // Run all health checks in parallel
    const [db, redis, pii, queues] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealthWithTimeout(),
      checkPiiCoverage(),
      checkQueueHealth(),
    ]);

    const overallOk = db.ok && redis.ok && queues.ok;

    const response = {
      ok: overallOk,
      version: process.env.npm_package_version || '1.0.0',
      db,
      redis,
      queues,
      pii,
      timestamp: new Date().toISOString(),
      request_id: requestId,
    };

    logger.info({ request_id: requestId, ...response }, 'Health check completed');
    res.json(response);
  } catch (error) {
    logger.error({ error: error.message, request_id: requestId }, 'Health check failed');
    res.status(500).json({
      ok: false,
      error: 'Health check failed',
      request_id: requestId,
    });
  }
});

// Readiness endpoint - only returns 200 if all critical systems are healthy
router.get('/ready', async (req, res) => {
  const requestId = req.get('x-request-id') || 'unknown';

  try {
    const [db, redis, queues] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealthWithTimeout(),
      checkQueueHealth(),
    ]);

    const ready = db.ok && redis.ok && queues.ok;

    if (ready) {
      res.json({ ready: true, request_id: requestId });
    } else {
      res.status(503).json({
        ready: false,
        db: db.ok,
        redis: redis.ok,
        queues: queues.ok,
        request_id: requestId,
      });
    }
  } catch (error) {
    logger.error({ error: error.message, request_id: requestId }, 'Readiness check failed');
    res.status(503).json({
      ready: false,
      error: 'Readiness check failed',
      request_id: requestId,
    });
  }
});

export default router;
