// src/scripts/checkEnv.js
// Environment validation using envalid
import 'dotenv/config';

import { cleanEnv, str, url, port, bool } from 'envalid';

try {
  const env = cleanEnv(process.env, {
    APP_URL: url(),
    PORT: port({ default: 8080 }),
    DATABASE_URL: str(),
    SHOPIFY_API_KEY: str(),
    SHOPIFY_API_SECRET: str(),
    SHOPIFY_SCOPES: str(),
    WEBHOOK_SECRET: str(),
    JWT_SECRET: str({ desc: 'Min 24 chars recommended' }),
    ENCRYPTION_KEY: str({ desc: '32-byte key (hex/base64). Do not commit.' }),
    MITTO_API_URL: url(),
    MITTO_API_KEY: str(),
    QUEUE_DRIVER: str({ choices: ['memory', 'redis'], default: 'memory' }),
    REDIS_URL: str({ default: '', desc: 'Required if QUEUE_DRIVER=redis' }),
    NODE_ENV: str({ default: 'development' }),
    PCD_APPROVED: bool({ default: false }),
  });

  if (env.QUEUE_DRIVER === 'redis' && !env.REDIS_URL) {
    throw new Error('QUEUE_DRIVER=redis but REDIS_URL is empty');
  }

  // Basic APP_URL sanity
  if (!env.APP_URL.startsWith('https://') && env.NODE_ENV !== 'development') {
    console.warn('[env:check] APP_URL is not https in non-dev mode');
  }

  console.log('[env:check] OK');
  process.exit(0);
} catch (e) {
  console.error('[env:check] FAILED:', e.message || e);
  process.exit(1);
}
