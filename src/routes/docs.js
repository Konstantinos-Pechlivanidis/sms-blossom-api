// src/routes/docs.js
// OpenAPI documentation router with Swagger UI

import { Router } from 'express';
import fs from 'fs';
import YAML from 'yaml';
import swaggerUi from 'swagger-ui-express';

const router = Router();

function loadSpec() {
  try {
    // openapi/openapi.yaml relative to this file (src/routes/docs.js)
    const url = new URL('../../openapi/openapi.yaml', import.meta.url);
    const raw = fs.readFileSync(url, 'utf8');
    return YAML.parse(raw);
  } catch {
    return {
      openapi: '3.1.0',
      info: { title: 'SMS Blossom API (spec load failed)', version: '1.0.0' },
      paths: {},
    };
  }
}

const spec = loadSpec();

// Serve JSON spec
router.get('/openapi.json', (_req, res) => res.json(spec));

// Swagger UI
router.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }));

export default router;
