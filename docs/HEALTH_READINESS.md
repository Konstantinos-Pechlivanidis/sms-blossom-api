# Health and Readiness System

This document describes the health and readiness monitoring system for the SMS Blossom backend.

## Overview

The health system provides comprehensive monitoring of all critical components:
- Database connectivity and performance
- Redis connectivity and performance  
- Queue system health
- PII encryption coverage
- Overall system readiness

## Endpoints

### GET /health

Comprehensive health check that returns the status of all system components.

**Response Format:**
```json
{
  "ok": true,
  "version": "1.0.0",
  "db": {
    "ok": true,
    "latency_ms": 15
  },
  "redis": {
    "ok": true,
    "latency_ms": 8
  },
  "queues": {
    "ok": true,
    "workers": 1
  },
  "pii": {
    "phone_pct": 95,
    "email_pct": 98
  },
  "timestamp": "2025-01-07T08:00:00.000Z",
  "request_id": "req-123"
}
```

**Status Codes:**
- `200 OK` - Always returns 200, even if subsystems are unhealthy
- `500 Internal Server Error` - Only if health check itself fails

### GET /health/ready

Readiness probe that returns 200 only if all critical systems are healthy.

**Response Format:**
```json
{
  "ready": true,
  "request_id": "req-123"
}
```

**Status Codes:**
- `200 OK` - All critical systems healthy
- `503 Service Unavailable` - One or more critical systems unhealthy

## Health Checks

### Database Health

**Check:** `SELECT 1 as health_check`
**Timeout:** 800ms
**Critical:** Yes

**Response:**
```json
{
  "ok": true,
  "latency_ms": 15
}
```

### Redis Health

**Check:** `PING` command
**Timeout:** 800ms
**Critical:** Yes

**Response:**
```json
{
  "ok": true,
  "latency_ms": 8
}
```

### Queue Health

**Check:** Queue driver configuration and worker status
**Timeout:** N/A (synchronous check)
**Critical:** Yes

**Response:**
```json
{
  "ok": true,
  "workers": 1
}
```

### PII Coverage

**Check:** Percentage of encrypted phone/email data
**Timeout:** 250ms
**Critical:** No (graceful degradation)

**Response:**
```json
{
  "phone_pct": 95,
  "email_pct": 98
}
```

**Graceful Degradation:**
- If timeout occurs, returns `null` values
- Does not affect overall health status
- Logs warning for monitoring

## Timeout Handling

All health checks implement timeout protection:

```javascript
async function withTimeout(promise, timeoutMs, operation) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  
  const startTime = Date.now();
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    const latency = Date.now() - startTime;
    return { result, latency };
  } catch (error) {
    const latency = Date.now() - startTime;
    throw { error, latency };
  }
}
```

## Error Handling

### Database Errors

```json
{
  "ok": false,
  "latency_ms": 800,
  "error": "Database connection timeout"
}
```

### Redis Errors

```json
{
  "ok": false,
  "latency_ms": 800,
  "error": "Redis connection failed"
}
```

### PII Coverage Errors

```json
{
  "phone_pct": null,
  "email_pct": null,
  "error": "PII coverage check timeout"
}
```

## Logging

All health checks include structured logging:

```javascript
logger.info({ 
  request_id: requestId, 
  db: { ok: true, latency_ms: 15 },
  redis: { ok: true, latency_ms: 8 },
  queues: { ok: true, workers: 1 },
  pii: { phone_pct: 95, email_pct: 98 }
}, 'Health check completed');
```

**Log Levels:**
- `info` - Successful health checks
- `warn` - Subsystem failures (non-critical)
- `error` - Health check system failures

## Monitoring Integration

### Prometheus Metrics

Health check results are exposed as Prometheus metrics:

```prometheus
# Health check status
sms_blossom_health_check_status{component="db"} 1
sms_blossom_health_check_status{component="redis"} 1
sms_blossom_health_check_status{component="queues"} 1

# Health check latency
sms_blossom_health_check_latency_seconds{component="db"} 0.015
sms_blossom_health_check_latency_seconds{component="redis"} 0.008

# PII coverage percentage
sms_blossom_pii_coverage_percentage{data_type="phone"} 95
sms_blossom_pii_coverage_percentage{data_type="email"} 98
```

### Alerting Rules

```yaml
# Database health alert
- alert: DatabaseUnhealthy
  expr: sms_blossom_health_check_status{component="db"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Database health check failing"

# Redis health alert  
- alert: RedisUnhealthy
  expr: sms_blossom_health_check_status{component="redis"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Redis health check failing"

# High latency alert
- alert: HighHealthCheckLatency
  expr: sms_blossom_health_check_latency_seconds > 1
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "Health check latency is high"
```

## Load Balancer Integration

### Health Check Path

Configure load balancer to use `/health` for health checks:

```yaml
# Kubernetes example
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### Render.com Integration

```yaml
# render.yaml
services:
  - type: web
    name: sms-blossom-api
    healthCheckPath: /health
    healthCheckGracePeriod: 30s
```

## Troubleshooting

### Common Issues

1. **Database Connection Timeout**
   - Check database connectivity
   - Verify connection pool settings
   - Check network latency

2. **Redis Connection Timeout**
   - Check Redis connectivity
   - Verify Redis configuration
   - Check Redis memory usage

3. **PII Coverage Timeout**
   - Check database performance
   - Verify table indexes
   - Consider query optimization

4. **Queue Health Issues**
   - Check Redis connection
   - Verify queue configuration
   - Check worker processes

### Debug Commands

```bash
# Check health status
curl -s https://api.example.com/health | jq

# Check readiness
curl -s https://api.example.com/health/ready | jq

# Check specific component
curl -s https://api.example.com/health | jq '.db'
curl -s https://api.example.com/health | jq '.redis'
curl -s https://api.example.com/health | jq '.queues'
curl -s https://api.example.com/health | jq '.pii'
```

### Performance Tuning

1. **Database Optimization**
   - Add indexes for health check queries
   - Optimize connection pool settings
   - Monitor query performance

2. **Redis Optimization**
   - Tune Redis configuration
   - Monitor memory usage
   - Optimize connection settings

3. **Timeout Tuning**
   - Adjust timeout values based on environment
   - Monitor latency trends
   - Set appropriate thresholds

## Security Considerations

1. **Information Disclosure**
   - Health endpoints don't expose sensitive data
   - Error messages are generic
   - No PII in health responses

2. **Rate Limiting**
   - Health endpoints should be rate limited
   - Prevent health check abuse
   - Monitor for unusual patterns

3. **Access Control**
   - Health endpoints are public
   - Ready endpoints may be restricted
   - Metrics endpoints require authentication
