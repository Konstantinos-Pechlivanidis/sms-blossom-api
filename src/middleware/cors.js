import cors from 'cors';

const allowlist = (process.env.CORS_ALLOWLIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export const corsMiddleware = cors({
  origin(origin, cb) {
    // Allow server-to-server (no Origin) and allowlisted origins
    if (!origin) return cb(null, true);
    if (allowlist.includes(origin)) return cb(null, true);
    // Useful if you ever embed something from Admin
    if (origin === 'https://admin.shopify.com') return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Request-Id'],
  credentials: true,
  maxAge: 600
});
