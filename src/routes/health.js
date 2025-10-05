import { Router } from 'express';
import { checkDatabaseHealthy } from '../db/prismaClient.js';

const router = Router();

router.get('/', async (req, res) => {
  const db = await checkDatabaseHealthy();
  const queue = process.env.QUEUE_DRIVER || 'memory';
  res.json({ status: 'ok', db, queue });
});

export default router;
