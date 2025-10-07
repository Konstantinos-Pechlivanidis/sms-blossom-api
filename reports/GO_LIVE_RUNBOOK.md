# Go-Live Runbook

## Overview

This runbook provides instructions for running the SMS Blossom go-live verification, interpreting results, and handling rollback scenarios.

## Prerequisites

### Environment Setup

1. **Copy environment template:**

   ```bash
   cp checks/runtime.env.example .env.verification
   ```

2. **Fill in required values in `.env.verification`:**
   - `BASE_URL`: Your deployed backend URL
   - `FRONTEND_URL`: Your frontend app URL
   - `DEV_SHOP_DOMAIN`: Test shop domain
   - `DATABASE_URL`: Database connection string
   - `REDIS_URL`: Redis connection string
   - `WEBHOOK_HMAC_SECRET`: Webhook HMAC secret
   - `JWT_SECRET`: JWT signing secret
   - `ENCRYPTION_KEY`: PII encryption key
   - `HASH_PEPPER`: Hash pepper for PII hashing

3. **Load environment:**
   ```bash
   source .env.verification
   # OR on Windows:
   # Get-Content .env.verification | ForEach-Object { $_.Split('=') | ForEach-Object { Set-Variable -Name $_[0] -Value $_[1] } }
   ```

### Dependencies

- Node.js 20+
- Access to deployed backend
- Valid test shop with app installed
- Redis instance accessible
- Database access (read-only)

## Running Verification

### Quick Start

```bash
# Run full verification
node checks/go-live-verification.js

# Run specific checks
node checks/live-contract.test.js
node checks/live-security.test.js
node checks/live-queues.test.js
```

### Individual Check Scripts

#### 1. Environment & Config Sanity

```bash
node checks/live-contract.test.js
```

- Verifies all required environment variables
- Checks CORS configuration
- Validates x-request-id headers

#### 2. Database & Migrations

```bash
node checks/live-database.test.js
```

- Checks Prisma migration status
- Validates required columns exist
- Verifies PII encryption coverage

#### 3. Redis & Queues

```bash
node checks/live-queues.test.js
```

- Tests Redis connectivity
- Verifies queue health endpoints
- Enqueues smoke test jobs

#### 4. Security Surface

```bash
node checks/live-security.test.js
```

- Tests App Proxy HMAC validation
- Verifies JWT authentication
- Checks rate limiting

#### 5. Webhooks

```bash
node checks/live-webhooks.test.js
```

- Simulates signed webhook requests
- Verifies event persistence
- Checks queue job enqueuing

#### 6. Templates

```bash
node checks/live-templates.test.js
```

- Tests template preview endpoint
- Validates strict mode enforcement
- Checks custom filters

#### 7. Campaigns & Discounts

```bash
node checks/live-campaigns-discounts.test.js
```

- Tests CRUD operations
- Verifies cost estimation
- Checks test send functionality

#### 8. Reports & Cache

```bash
node checks/live-reports-cache.test.js
```

- Tests cache hit/miss behavior
- Measures response latency
- Validates report endpoints

#### 9. Metrics

```bash
node checks/live-metrics.test.js
```

- Checks Prometheus metrics endpoint
- Validates required counters/histograms
- Tests metrics collection

## Interpreting Results

### Status Codes

- **PASS**: Component is fully operational
- **WARN**: Component works but has issues (e.g., PII coverage <95%)
- **FAIL**: Component has critical issues
- **PENDING**: Check not implemented or unavailable

### Critical Issues

Any component with **FAIL** status blocks go-live. Common issues:

#### Database Issues

- **Migration not applied**: Run `npx prisma migrate deploy`
- **Missing columns**: Check schema alignment
- **PII coverage low**: Run encryption migration script

#### Redis Issues

- **Connection failed**: Check REDIS_URL and network access
- **Queue health false**: Verify BullMQ workers are running
- **DLQ not empty**: Check failed job logs

#### Security Issues

- **HMAC validation failed**: Check WEBHOOK_HMAC_SECRET
- **JWT validation failed**: Check JWT_SECRET
- **Rate limiting not working**: Check Redis connection for rate limiter

#### Webhook Issues

- **HMAC signature invalid**: Verify webhook secret
- **Events not persisted**: Check database connection
- **Queue jobs not enqueued**: Check Redis and BullMQ

## Rollback Procedures

### Database Rollback

```bash
# If migration caused issues
npx prisma migrate rollback

# If data corruption
npx prisma migrate reset --force
```

### Redis Rollback

```bash
# Clear failed jobs
redis-cli FLUSHDB

# Restart workers
pm2 restart sms-blossom-worker
```

### Application Rollback

```bash
# Revert to previous deployment
git checkout <previous-commit>
npm run build
npm run start
```

## Monitoring & Alerts

### Key Metrics to Watch

- **Queue depth**: Should be <100 for normal operation
- **PII coverage**: Should be ≥95% for phone and email
- **Cache hit rate**: Should be >80% for reports
- **Response latency**: P95 should be <800ms

### Health Check Endpoints

- `/health`: Overall system health
- `/queue/health`: Queue system status
- `/metrics`: Prometheus metrics

### Log Locations

- **Application logs**: Check your hosting platform logs
- **Database logs**: Check your database provider logs
- **Redis logs**: Check Redis server logs

## Troubleshooting

### Common Issues

#### "Database connection failed"

1. Check DATABASE_URL format
2. Verify network access
3. Check database server status

#### "Redis connection failed"

1. Check REDIS_URL format
2. Verify Redis server is running
3. Check firewall rules

#### "Webhook HMAC validation failed"

1. Verify WEBHOOK_HMAC_SECRET matches Shopify
2. Check webhook URL configuration
3. Test with Shopify webhook simulator

#### "Queue jobs not processing"

1. Check Redis connection
2. Verify BullMQ workers are running
3. Check job processor logs

### Debug Commands

```bash
# Check environment variables
node -e "console.log(process.env)"

# Test database connection
npx prisma db pull

# Test Redis connection
redis-cli ping

# Check queue status
curl ${BASE_URL}/queue/health

# View metrics
curl ${BASE_URL}/metrics
```

## Support

### Internal Resources

- **Technical Lead**: [Contact information]
- **DevOps Team**: [Contact information]
- **Database Admin**: [Contact information]

### External Resources

- **Shopify Partner Dashboard**: [URL]
- **Database Provider Support**: [Contact information]
- **Redis Provider Support**: [Contact information]

### Emergency Contacts

- **On-call Engineer**: [Phone/Email]
- **Escalation Manager**: [Phone/Email]

## Post-Go-Live Checklist

### Immediate (0-1 hours)

- [ ] Monitor error rates
- [ ] Check queue processing
- [ ] Verify webhook delivery
- [ ] Test user flows

### Short-term (1-24 hours)

- [ ] Monitor performance metrics
- [ ] Check PII encryption status
- [ ] Verify report generation
- [ ] Test campaign sending

### Long-term (1-7 days)

- [ ] Review system stability
- [ ] Analyze usage patterns
- [ ] Optimize performance
- [ ] Plan capacity scaling

## Appendix

### Environment Variables Reference

See `checks/runtime.env.example` for complete list.

### API Endpoints Reference

- **Health**: `GET /health`
- **Queue Health**: `GET /queue/health`
- **Metrics**: `GET /metrics`
- **Reports**: `GET /reports/*`
- **Templates**: `POST /templates/preview`
- **Webhooks**: `POST /webhooks/shopify/*`

### File Locations

- **Verification Scripts**: `checks/`
- **Reports**: `reports/`
- **Environment Template**: `checks/runtime.env.example`
- **Dashboard**: `reports/GO_LIVE_DASHBOARD.md`
