import 'dotenv/config';
import express from 'express';
import { logger, httpLogger } from './lib/logger.js';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { checkDatabaseHealthy, disconnectPrisma } from './db/prismaClient.js';
import { schedulerBoot } from './services/scheduler.js';
import { startScheduler } from './services/scheduler.js';
import healthRouter from './routes/health.js';
import discountsRouter from './routes/discounts.js';
import settingsRouter from './routes/settings.js';
import reportsRouter from './routes/reports.js';
import automationsRouter from './routes/automations.js';
import docsRouter from './routes/docs.js';
import * as oauthRouter from './auth/oauth.js';
import templatesRouter from './routes/templates.js';
import devRouter from './routes/dev.js';
import shopifyWebhooksRouter from './webhooks/shopify.js';
import mittoDlrRouter from './webhooks/mitto-dlr.js';
import mittoInboundRouter from './webhooks/mitto-inbound.js';
import gdprRouter from './webhooks/gdpr.js';
import storefrontConsentRouter from './proxy/storefront-consent.js';
import unsubscribeRouter from './proxy/unsubscribe.js';
import publicUnsubscribe from './routes/public-unsubscribe.js';
import publicBackInStock from './routes/public-back-in-stock.js';
import campaignsRouter from './routes/campaigns.js';
import segmentsRouter from './routes/segments.js';
import shortlinksRouter from './routes/shortlinks.js';

const app = express();

// Basic env checks
const required = ['APP_URL', 'DATABASE_URL'];
for (const key of required) {
  if (!process.env[key]) {
    logger.warn({ key }, 'missing env');
  }
}

// Collect raw body for webhooks
app.use((req, res, next) => {
  if (req.path.startsWith('/webhooks/')) {
    let data = Buffer.alloc(0);
    req.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
    });
    req.on('end', () => {
      req.rawBody = data;
      next();
    });
  } else {
    next();
  }
});

app.set('trust proxy', 1);

// JSON parser for normal routes and also after raw body capture
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));

// Logging
app.use(requestId());
app.use(httpLogger());

// Routes
app.use('/health', healthRouter);
app.use('/auth', (req, res, next) => {
  // map GET /auth/install and /auth/callback to handlers
  if (req.method === 'GET' && req.path === '/install') return oauthRouter.install(req, res, next);
  if (req.method === 'GET' && req.path === '/callback') return oauthRouter.callback(req, res, next);
  return res.status(404).send('Not found');
});
app.use('/discounts', discountsRouter);
app.use('/settings', settingsRouter);
app.use('/reports', reportsRouter);
app.use('/automations', automationsRouter);
app.use('/', docsRouter); // /docs and /openapi.json
app.use('/templates', templatesRouter);
app.use('/dev', devRouter);
app.use('/webhooks/shopify', shopifyWebhooksRouter);
app.use('/webhooks/gdpr', gdprRouter);
app.use('/webhooks/mitto/dlr', mittoDlrRouter);
app.use('/webhooks/mitto/inbound', mittoInboundRouter);
app.use('/public/storefront/consent', storefrontConsentRouter);
app.use('/public/unsubscribe', unsubscribeRouter);
app.use('/public/unsubscribe', publicUnsubscribe);
app.use('/public/back-in-stock', publicBackInStock);
app.use('/campaigns', campaignsRouter);
app.use('/segments', segmentsRouter);
app.use('/s', shortlinksRouter);

// Error handler
app.use(errorHandler);

const port = Number(process.env.PORT || 3000);

let server = null;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, async () => {
    const db = await checkDatabaseHealthy();
    logger.info(
      { port, db, queue: process.env.QUEUE_DRIVER || 'memory' },
      'sms-blossom-api listening',
    );

    // Boot the durable in-memory scheduler
    schedulerBoot().catch((e) => logger.error({ err: e }, '[schedulerBoot] error'));

    // Sprint C: start DB-backed scheduler (works with or without Redis)
    startScheduler({ intervalMs: 15000 });
  });
}

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app, server };
export default app;
