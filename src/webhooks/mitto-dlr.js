import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';

const router = Router();
const prisma = getPrismaClient();

/**
 * Mitto posts delivery receipts to our callback_url.
 * We include ?mid=<Message.id> so that we can map reliably without schema changes.
 * Body shape varies; we accept JSON or urlencoded. We read status from known fields as best-effort.
 */
router.post('/', async (req, res) => {
  const mid = String(req.query.mid || '');
  if (!mid) return res.sendStatus(200);

  const status =
    req.body?.status || req.body?.message_status || req.body?.dlr_status || req.body?.State || '';
  const normalized = String(status).toUpperCase();

  let next = 'sent';
  if (normalized.includes('DELIV')) next = 'delivered';
  else if (['FAILED', 'UNDELIV', 'EXPIRED', 'REJECTED', 'REJECTD'].includes(normalized))
    next = 'failed';

  try {
    await prisma.message.update({
      where: { id: mid },
      data: { status: next, metadata: { ...(req.body || {}), providerStatus: normalized } },
    });
  } catch {
    // ignore missing rows
  }
  res.sendStatus(200);
});

export default router;
