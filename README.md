# sms-blossom-api

Production-grade Node.js (ESM) Express API for SMS + Shopify integration.

## Stack

- Node 20+, ESM only
- Express 4
- Pino logging + request id
- Env via dotenv
- Postgres via Prisma (Neon-ready)
- Ajv for validation
- Shopify Admin GraphQL helper (API 2025-10)
- Queue adapters: Memory (phase 1). No Redis yet.

## Getting Started

1. Copy env
   - cp .env.example .env
   - Fill DATABASE_URL, APP_URL, WEBHOOK_SECRET, ENCRYPTION_KEY (base64 32 bytes), etc.

2. Install deps
   - npm install

3. Prisma
   - npm run prisma:generate
   - npm run prisma:migrate
   - npm run prisma:studio

4. Run
   - npm run dev
   - GET http://localhost:3000/health → {"status":"ok","db":true,"queue":"memory"}

## Design Notes

- Webhooks use raw body collector + HMAC verification via WEBHOOK_SECRET.
- Events are persisted with unique dedupeKey, duplicates short-circuited by DB.
- Memory queue provides TTL dedupe (5m). No Redis in phase 1.
- OAuth skeleton stores offline token encrypted in Shop.tokenOffline.

## Future (Phase 2)

- Add BullMQ + ioredis in `src/queue/` as a separate adapter.
- Replace `getQueue()` to select adapter via QUEUE_DRIVER.

## Scripts

- dev: node --watch src/server.js
- start: node src/server.js
- prisma:generate/migrate/studio

## License

MIT
