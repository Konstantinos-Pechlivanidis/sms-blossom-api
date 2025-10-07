# Render.com Deployment Guide

This document provides step-by-step instructions for deploying the SMS Blossom backend to Render.com.

## Overview

The SMS Blossom backend consists of two services:

1. **Web API Service** - Handles HTTP requests, webhooks, and API endpoints
2. **Worker Service** - Processes background jobs and queue tasks

## Prerequisites

- Render.com account
- GitHub repository with the SMS Blossom backend code
- Database (PostgreSQL) - can be provisioned through Render
- Redis instance - can be provisioned through Render

## Service 1: Web API Service

### Configuration

1. **Service Type**: Web Service
2. **Build Command**: `npm install && npx prisma generate`
3. **Start Command**: `npx prisma migrate deploy && node dist/server.js`
4. **Health Check Path**: `/health`

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Redis
REDIS_URL=redis://user:password@host:port
REDIS_PREFIX=smsblossom:prod

# Security
WEBHOOK_HMAC_SECRET=your-webhook-secret
ENCRYPTION_KEY=your-32-byte-encryption-key
HASH_PEPPER=your-hash-pepper
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret

# Optional
METRICS_TOKEN=your-metrics-token
APP_PROXY_SUBPATH=/apps/sms-blossom

# Queue Configuration
QUEUE_DRIVER=redis

# External Services
MITTO_API_KEY=your-mitto-api-key
MITTO_API_URL=https://api.mitto.com
MITTO_CALLBACK_URL=https://your-api.onrender.com/webhooks/mitto
MITTO_HMAC_SECRET=your-mitto-hmac-secret

# CORS
CORS_ALLOWLIST=https://your-frontend.onrender.com,https://admin.shopify.com
```

### Build Settings

- **Node Version**: 20
- **Auto-Deploy**: Yes (on git push to main branch)

## Service 2: Worker Service

### Configuration

1. **Service Type**: Background Worker
2. **Build Command**: `npm install && npx prisma generate`
3. **Start Command**: `node dist/worker.js`
4. **Auto-Deploy**: Yes (on git push to main branch)

### Environment Variables

Same as Web API Service (all environment variables are shared).

## Database Setup

### Option 1: Render PostgreSQL

1. Create a new PostgreSQL service in Render
2. Copy the connection string to `DATABASE_URL`
3. The migration will run automatically on first deploy

### Option 2: External Database

1. Use your existing PostgreSQL database
2. Ensure the database is accessible from Render
3. Set `DATABASE_URL` to your connection string

## Redis Setup

### Option 1: Render Redis

1. Create a new Redis service in Render
2. Copy the connection string to `REDIS_URL`
3. Set appropriate `REDIS_PREFIX`

### Option 2: External Redis

1. Use your existing Redis instance
2. Ensure Redis is accessible from Render
3. Set `REDIS_URL` to your connection string

## Deployment Steps

### 1. Create Web Service

1. Go to Render Dashboard
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure the service as described above
5. Set all environment variables
6. Deploy

### 2. Create Worker Service

1. Go to Render Dashboard
2. Click "New +" → "Background Worker"
3. Connect the same GitHub repository
4. Configure the service as described above
5. Set all environment variables (same as web service)
6. Deploy

### 3. Verify Deployment

1. Check Web Service health: `GET https://your-service.onrender.com/health`
2. Check Worker Service logs for successful startup
3. Verify database migrations completed
4. Test queue health: `GET https://your-service.onrender.com/queue/health`

## Health Checks

### Web Service Health Endpoints

- `GET /health` - Comprehensive health check
- `GET /health/ready` - Readiness probe
- `GET /queue/health` - Queue system health
- `GET /metrics` - Prometheus metrics

### Expected Health Response

```json
{
  "ok": true,
  "version": "1.0.0",
  "db": { "ok": true, "latency_ms": 15 },
  "redis": { "ok": true, "latency_ms": 8 },
  "queues": { "ok": true, "workers": 1 },
  "pii": { "phone_pct": 95, "email_pct": 98 },
  "timestamp": "2025-01-07T08:00:00.000Z",
  "request_id": "req-123"
}
```

## Monitoring

### Metrics Endpoint

The `/metrics` endpoint provides Prometheus-compatible metrics:

- `sms_send_attempts_total` - SMS send attempts
- `sms_delivery_success_total` - Successful deliveries
- `queue_jobs_total` - Queue job counts
- `webhook_events_total` - Webhook event counts

### Logs

- Web Service logs: Available in Render dashboard
- Worker Service logs: Available in Render dashboard
- Application logs: Structured JSON logs with request IDs

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check `DATABASE_URL` format
   - Verify database is accessible
   - Check firewall settings

2. **Redis Connection Failed**
   - Check `REDIS_URL` format
   - Verify Redis is accessible
   - Check Redis authentication

3. **Health Check Failing**
   - Check service logs
   - Verify all environment variables are set
   - Check database and Redis connectivity

4. **Queue Jobs Not Processing**
   - Verify Worker Service is running
   - Check Redis connection
   - Verify queue configuration

### Debug Commands

```bash
# Check service status
curl https://your-service.onrender.com/health

# Check queue health
curl https://your-service.onrender.com/queue/health

# Check metrics
curl https://your-service.onrender.com/metrics
```

## Security Considerations

1. **Environment Variables**: Never commit secrets to git
2. **HTTPS**: Render provides HTTPS by default
3. **CORS**: Configure `CORS_ALLOWLIST` properly
4. **Rate Limiting**: Configured in the application
5. **HMAC Verification**: Required for webhooks

## Scaling

### Auto-Scaling

- Web Service: Scales based on CPU/memory usage
- Worker Service: Can be scaled manually or with auto-scaling

### Performance Tuning

- Database connection pooling
- Redis connection optimization
- Queue worker scaling
- Memory and CPU limits

## Backup and Recovery

### Database Backups

- Render PostgreSQL: Automatic backups
- External Database: Configure your own backup strategy

### Application Data

- Redis: Consider persistence settings
- File uploads: Use external storage (S3, etc.)

## Cost Optimization

1. **Service Sizing**: Start with minimal resources
2. **Auto-Sleep**: Web services sleep after inactivity
3. **Worker Scaling**: Scale workers based on queue depth
4. **Database**: Use appropriate instance size

## Support

For deployment issues:

1. Check Render service logs
2. Verify environment variables
3. Test health endpoints
4. Check database and Redis connectivity

For application issues:

1. Check application logs
2. Verify API endpoints
3. Test webhook delivery
4. Check queue processing
