// src/routes/shortlinks.js
// Shortlinks redirect route

import { Router } from 'express';
import { resolveShortlink } from '../services/shortlinks.js';

const router = Router();

/** GET /s/:slug → 302 redirect */
router.get('/:slug', async (req, res) => {
  const slug = String(req.params.slug || '');
  const url = await resolveShortlink(slug);
  if (!url) return res.status(404).send('Not found');
  res.redirect(302, url);
});

export default router;
