import 'dotenv/config';
import express from 'express';
import { corsMiddleware } from './middleware/cors.js';
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
import queueHealthRouter from './routes/queue-health.js';
import metricsRouter from './routes/metrics.js';
import { startWorkers } from './queue/worker.js';
import devRouter from './routes/dev.js';
import shopifyWebhooksRouter from './webhooks/shopify.js';
import shopifyOrdersRouter from './webhooks/shopify-orders.js';
import shopifyFulfillmentsRouter from './webhooks/shopify-fulfillments.js';
import shopifyCheckoutsRouter from './webhooks/shopify-checkouts.js';
import shopifyCustomersRouter from './webhooks/shopify-customers.js';
import shopifyInventoryRouter from './webhooks/shopify-inventory.js';
import shopifyGdprRouter from './webhooks/shopify-gdpr.js';
import mittoDlrRouter from './webhooks/mitto-dlr.js';
import mittoInboundRouter from './webhooks/mitto-inbound.js';
import gdprRouter from './webhooks/gdpr.js';
import gdprRestRouter from './routes/gdpr.js';
import storefrontConsentRouter from './proxy/storefront-consent.js';
import unsubscribeRouter from './proxy/unsubscribe.js';
import publicUnsubscribe from './routes/public-unsubscribe.js';
import publicBackInStock from './routes/public-back-in-stock.js';
import { appProxyVerifyMiddleware } from './middleware/appProxyVerify.js';
import { jwtVerifyMiddleware } from './middleware/jwt.js';
import { shopScopingMiddleware } from './middleware/shopScope.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import campaignsRouter from './routes/campaigns.js';
import segmentsRouter from './routes/segments.js';
import segmentsPreviewRouter from './routes/segments-preview.js';
import shortlinksRouter from './routes/shortlinks.js';
import discountPoolingRouter from './routes/discount-pooling.js';
import campaignPreparationRouter from './routes/campaign-preparation.js';
import adminSyncRouter from './routes/admin-sync.js';
import adminSystemSegmentsRouter from './routes/admin-system-segments.js';
import adminHealthShopifyRouter from './routes/admin-health-shopify.js';

const app = express();

// CORS first (safe for preflight)
app.use(corsMiddleware);
app.options('*', corsMiddleware);

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
app.use(
  '/discounts',
  rateLimitMiddleware(),
  jwtVerifyMiddleware,
  shopScopingMiddleware,
  discountsRouter,
);
app.use(
  '/settings',
  rateLimitMiddleware(),
  jwtVerifyMiddleware,
  shopScopingMiddleware,
  settingsRouter,
);
app.use(
  '/reports',
  rateLimitMiddleware(),
  jwtVerifyMiddleware,
  shopScopingMiddleware,
  reportsRouter,
);
app.use(
  '/automations',
  rateLimitMiddleware(),
  jwtVerifyMiddleware,
  shopScopingMiddleware,
  automationsRouter,
);
app.use('/', docsRouter); // /docs and /openapi.json
app.use('/templates', templatesRouter);
app.use('/dev', devRouter);
app.use('/webhooks/shopify', shopifyWebhooksRouter);
app.use('/webhooks/shopify', shopifyOrdersRouter);
app.use('/webhooks/shopify', shopifyFulfillmentsRouter);
app.use('/webhooks/shopify', shopifyCheckoutsRouter);
app.use('/webhooks/shopify', shopifyCustomersRouter);
app.use('/webhooks/shopify', shopifyInventoryRouter);
app.use('/webhooks/shopify', shopifyGdprRouter);
app.use('/webhooks/gdpr', gdprRouter);
app.use('/gdpr', gdprRestRouter);
app.use('/webhooks/mitto/dlr', mittoDlrRouter);
app.use('/webhooks/mitto/inbound', mittoInboundRouter);
// App Proxy routes - require signed request verification + rate limiting
app.use(
  '/public/storefront/consent',
  rateLimitMiddleware({ requests: 120, window: 60, burst: 10 }),
  appProxyVerifyMiddleware,
  storefrontConsentRouter,
);
app.use(
  '/public/unsubscribe',
  rateLimitMiddleware({ requests: 120, window: 60, burst: 10 }),
  appProxyVerifyMiddleware,
  unsubscribeRouter,
);
app.use(
  '/public/unsubscribe',
  rateLimitMiddleware({ requests: 120, window: 60, burst: 10 }),
  appProxyVerifyMiddleware,
  publicUnsubscribe,
);
app.use(
  '/public/back-in-stock',
  rateLimitMiddleware({ requests: 120, window: 60, burst: 10 }),
  appProxyVerifyMiddleware,
  publicBackInStock,
);

// Admin API routes - require JWT + shop scoping + rate limiting
app.use(
  '/campaigns',
  rateLimitMiddleware(),
  jwtVerifyMiddleware,
  shopScopingMiddleware,
  campaignsRouter,
);
app.use(
  '/segments',
  rateLimitMiddleware(),
  jwtVerifyMiddleware,
  shopScopingMiddleware,
  segmentsRouter,
);
app.use(
  '/segments',
  rateLimitMiddleware(),
  jwtVerifyMiddleware,
  shopScopingMiddleware,
  segmentsPreviewRouter,
);
app.use('/s', rateLimitMiddleware(), shortlinksRouter);
app.use('/discounts', rateLimitMiddleware(), jwtVerifyMiddleware, shopScopingMiddleware, discountPoolingRouter);
app.use('/campaigns', rateLimitMiddleware(), jwtVerifyMiddleware, shopScopingMiddleware, campaignPreparationRouter);
app.use('/admin/sync', rateLimitMiddleware(), jwtVerifyMiddleware, shopScopingMiddleware, adminSyncRouter);
app.use('/admin/system-segments', rateLimitMiddleware(), jwtVerifyMiddleware, shopScopingMiddleware, adminSystemSegmentsRouter);
app.use('/admin/health', rateLimitMiddleware(), jwtVerifyMiddleware, shopScopingMiddleware, adminHealthShopifyRouter);
app.use('/queue', queueHealthRouter);
app.use('/metrics', metricsRouter);

// Error handler
app.use(errorHandler);

const port = Number(process.env.PORT || 3000);

// Start workers (only if Redis is configured)
startWorkers().catch((error) => {
  logger.error({ error }, 'Failed to start workers');
  // Don't exit the process if workers fail - the app can still run with memory queue
  logger.warn('Continuing without BullMQ workers - using memory queue fallback');
});

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
