import { Router } from 'express';

const router = Router();

router.post('/preview', async (req, res) => {
  // TODO: render Liquid template preview
  res.json({ ok: true, html: '<p>Preview stub</p>' });
});

export default router;
