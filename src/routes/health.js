import { Router } from 'express';
import { checkDatabaseHealthy, getPrismaClient } from '../db/prismaClient.js';
import { checkRedisHealth } from '../queue/queues.js';

const router = Router();
const prisma = getPrismaClient();

router.get('/', async (req, res) => {
  const db = await checkDatabaseHealthy();
  const redis = await checkRedisHealth();
  const queue = process.env.QUEUE_DRIVER || 'memory';

  // Verify message timestamp fields work (prevent 42703 errors)
  let messageTimestamps = false;
  try {
    await prisma.$queryRaw`SELECT sent_at, delivered_at, failed_at FROM "Message" LIMIT 1`;
    messageTimestamps = true;
  } catch (error) {
    // Log error but don't fail health check
    console.warn('Message timestamp fields check failed:', error.message);
  }

  res.json({
    status: 'ok',
    db,
    redis,
    queue,
    messageTimestamps,
    queueDriver: process.env.QUEUE_DRIVER || 'memory',
  });
});

export default router;
