# Observability and Metrics

This document describes the observability and metrics system for the SMS Blossom backend.

## Overview

The observability system provides comprehensive monitoring through:

- Prometheus metrics collection
- Structured logging with request IDs
- Health and readiness probes
- Performance monitoring
- Error tracking and alerting

## Metrics Endpoints

### GET /metrics

Prometheus-compatible metrics endpoint.

**Response Format:**

```
# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.
# TYPE process_cpu_user_seconds_total counter
process_cpu_user_seconds_total 0.123

# HELP sms_send_attempts_total Total number of SMS send attempts
# TYPE sms_send_attempts_total counter
sms_send_attempts_total{provider="mitto",status="success"} 100
sms_send_attempts_total{provider="mitto",status="failed"} 5

# HELP sms_delivery_success_total Total number of successful SMS deliveries
# TYPE sms_delivery_success_total counter
sms_delivery_success_total{provider="mitto"} 95

# HELP queue_jobs_total Total number of queue jobs processed
# TYPE queue_jobs_total counter
queue_jobs_total{queue="events",status="completed"} 1000
queue_jobs_total{queue="delivery",status="failed"} 10

# HELP webhook_events_total Total number of webhook events received
# TYPE webhook_events_total counter
webhook_events_total{topic="orders/paid",status="success"} 500
webhook_events_total{topic="orders/paid",status="failed"} 2
```

**Status Codes:**

- `200 OK` - Metrics retrieved successfully
- `401 Unauthorized` - Invalid or missing metrics token
- `500 Internal Server Error` - Metrics collection failed

### GET /metrics/json

JSON format metrics for debugging and integration.

**Response Format:**

```json
{
  "metrics": [
    {
      "name": "sms_send_attempts_total",
      "help": "Total number of SMS send attempts",
      "type": "counter",
      "values": [
        {
          "labels": { "provider": "mitto", "status": "success" },
          "value": 100
        }
      ]
    }
  ],
  "timestamp": "2025-01-07T08:00:00.000Z",
  "request_id": "req-123"
}
```

### GET /metrics/health

Health check for the metrics endpoint.

**Response Format:**

```json
{
  "status": "ok",
  "endpoint": "/metrics",
  "auth_required": true,
  "timestamp": "2025-01-07T08:00:00.000Z",
  "request_id": "req-123"
}
```

## Authentication

### Metrics Token

The metrics endpoint can be protected with a token:

```bash
# Set environment variable
export METRICS_TOKEN="your-secure-token"

# Access metrics with token
curl -H "Authorization: Bearer your-secure-token" \
  https://api.example.com/metrics
```

### Token Configuration

```yaml
# render.yaml
envVars:
  - key: METRICS_TOKEN
    sync: false # Set via Render dashboard
```

## Metrics Categories

### System Metrics

Default Node.js and system metrics collected by `prom-client`:

```prometheus
# CPU usage
process_cpu_user_seconds_total
process_cpu_system_seconds_total

# Memory usage
process_resident_memory_bytes
process_heap_bytes

# Event loop
nodejs_eventloop_lag_seconds

# Garbage collection
nodejs_gc_duration_seconds
```

### Application Metrics

Custom metrics for SMS Blossom functionality:

#### SMS Metrics

```prometheus
# SMS send attempts
sms_send_attempts_total{provider="mitto",status="success|failed"}

# SMS delivery success
sms_delivery_success_total{provider="mitto"}

# SMS delivery failures
sms_delivery_failure_total{provider="mitto",error_type="timeout|invalid|rate_limit"}
```

#### Queue Metrics

```prometheus
# Queue job counts
queue_jobs_total{queue="events|automations|campaigns|delivery|housekeeping",status="waiting|active|completed|failed|delayed"}

# Queue job duration
queue_job_duration_seconds{queue="events|automations|campaigns|delivery|housekeeping",status="success|failed"}
```

#### Webhook Metrics

```prometheus
# Webhook events
webhook_events_total{topic="orders/paid|checkouts/update|inventory_levels/update",status="success|failed"}
```

#### Rate Limiting Metrics

```prometheus
# Rate limit hits
rate_limit_hits_total{endpoint="/api/campaigns",ip="192.168.1.1"}
```

#### Cache Metrics

```prometheus
# Cache hits
cache_hits_total{cache_type="reports|templates"}

# Cache misses
cache_misses_total{cache_type="reports|templates"}
```

#### Connection Metrics

```prometheus
# Active connections
active_connections{type="database|redis|http"}
```

#### PII Coverage Metrics

```prometheus
# PII encryption coverage
pii_coverage_percentage{data_type="phone|email"}
```

## Alerting Rules

### Critical Alerts

```yaml
# High error rate
- alert: HighErrorRate
  expr: rate(sms_send_attempts_total{status="failed"}[5m]) / rate(sms_send_attempts_total[5m]) > 0.1
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: 'High SMS error rate detected'

# Queue backlog
- alert: QueueBacklog
  expr: queue_jobs_total{status="waiting"} > 100
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: 'Queue backlog is high'

# Webhook failures
- alert: WebhookFailures
  expr: rate(webhook_events_total{status="failed"}[5m]) > 0.1
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: 'High webhook failure rate'
```

### Warning Alerts

```yaml
# High latency
- alert: HighLatency
  expr: histogram_quantile(0.95, rate(queue_job_duration_seconds_bucket[5m])) > 30
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: 'High queue processing latency'

# Cache miss rate
- alert: HighCacheMissRate
  expr: rate(cache_misses_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) > 0.5
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: 'High cache miss rate'

# Rate limiting
- alert: RateLimitHits
  expr: rate(rate_limit_hits_total[5m]) > 10
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: 'High rate limit hit rate'
```

## Dashboard Queries

### SMS Performance

```prometheus
# SMS success rate
rate(sms_send_attempts_total{status="success"}[5m]) / rate(sms_send_attempts_total[5m])

# SMS delivery rate
rate(sms_delivery_success_total[5m]) / rate(sms_send_attempts_total{status="success"}[5m])

# Average SMS processing time
rate(sms_send_duration_seconds_sum[5m]) / rate(sms_send_duration_seconds_count[5m])
```

### Queue Performance

```prometheus
# Queue processing rate
rate(queue_jobs_total{status="completed"}[5m])

# Queue error rate
rate(queue_jobs_total{status="failed"}[5m]) / rate(queue_jobs_total[5m])

# Average queue processing time
rate(queue_job_duration_seconds_sum[5m]) / rate(queue_job_duration_seconds_count[5m])
```

### System Health

```prometheus
# CPU usage
rate(process_cpu_user_seconds_total[5m]) * 100

# Memory usage
process_resident_memory_bytes / 1024 / 1024

# Event loop lag
nodejs_eventloop_lag_seconds * 1000
```

## Logging

### Structured Logging

All logs use structured JSON format with request IDs:

```json
{
  "level": "info",
  "time": "2025-01-07T08:00:00.000Z",
  "request_id": "req-123",
  "shop_domain": "example.myshopify.com",
  "route": "/api/campaigns",
  "method": "POST",
  "status_code": 200,
  "duration_ms": 150,
  "message": "Campaign created successfully"
}
```

### Log Levels

- `error` - System errors, exceptions
- `warn` - Warnings, non-critical issues
- `info` - General information, successful operations
- `debug` - Detailed debugging information

### Request Tracing

Every request includes a unique request ID for tracing:

```javascript
// Request ID middleware
app.use((req, res, next) => {
  req.requestId = req.get('x-request-id') || generateRequestId();
  res.set('x-request-id', req.requestId);
  next();
});
```

## Performance Monitoring

### Key Performance Indicators (KPIs)

1. **SMS Delivery Rate**
   - Target: >95% success rate
   - Alert: <90% success rate

2. **Queue Processing Time**
   - Target: <5 seconds average
   - Alert: >30 seconds average

3. **API Response Time**
   - Target: <200ms p95
   - Alert: >1 second p95

4. **Webhook Processing**
   - Target: <1 second average
   - Alert: >5 seconds average

### Performance Budgets

```yaml
# Performance budgets
budgets:
  - metric: 'http_request_duration_seconds'
    threshold: 0.2
    percentile: 95
    window: '5m'

  - metric: 'queue_job_duration_seconds'
    threshold: 5
    percentile: 95
    window: '5m'

  - metric: 'sms_send_duration_seconds'
    threshold: 2
    percentile: 95
    window: '5m'
```

## Troubleshooting

### Common Issues

1. **Metrics Collection Failed**
   - Check metrics endpoint accessibility
   - Verify metrics token configuration
   - Check Prometheus client configuration

2. **High Memory Usage**
   - Monitor memory metrics
   - Check for memory leaks
   - Optimize data structures

3. **High CPU Usage**
   - Monitor CPU metrics
   - Check for inefficient algorithms
   - Optimize processing logic

4. **Queue Processing Delays**
   - Monitor queue metrics
   - Check worker performance
   - Verify Redis connectivity

### Debug Commands

```bash
# Check metrics endpoint
curl -H "Authorization: Bearer $METRICS_TOKEN" \
  https://api.example.com/metrics

# Check specific metrics
curl -H "Authorization: Bearer $METRICS_TOKEN" \
  https://api.example.com/metrics | grep "sms_send_attempts_total"

# Check metrics health
curl https://api.example.com/metrics/health

# Get JSON metrics
curl -H "Authorization: Bearer $METRICS_TOKEN" \
  https://api.example.com/metrics/json
```

## Security Considerations

1. **Metrics Access Control**
   - Protect metrics endpoint with token
   - Limit access to monitoring systems
   - Use HTTPS for metrics collection

2. **Information Disclosure**
   - Metrics don't expose sensitive data
   - Use labels carefully
   - Avoid PII in metric labels

3. **Rate Limiting**
   - Limit metrics endpoint access
   - Prevent metrics scraping abuse
   - Monitor for unusual patterns

## Integration

### Prometheus Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'sms-blossom-api'
    static_configs:
      - targets: ['api.example.com:443']
    scheme: https
    bearer_token: 'your-metrics-token'
    metrics_path: '/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "SMS Blossom API",
    "panels": [
      {
        "title": "SMS Success Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "rate(sms_send_attempts_total{status=\"success\"}[5m]) / rate(sms_send_attempts_total[5m]) * 100"
          }
        ]
      }
    ]
  }
}
```
