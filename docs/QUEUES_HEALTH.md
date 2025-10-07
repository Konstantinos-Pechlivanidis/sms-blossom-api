# Queue Health Monitoring

This document describes the queue health monitoring system for the SMS Blossom backend.

## Overview

The queue health system provides comprehensive monitoring of the BullMQ queue infrastructure:

- Redis connectivity status
- Queue job counts (waiting, active, completed, failed, delayed)
- Dead Letter Queue (DLQ) monitoring
- Worker status and performance

## Endpoints

### GET /queue/health

Comprehensive queue health check that returns the status of all queues and Redis.

**Response Format:**

```json
{
  "redis": true,
  "queues": {
    "events": {
      "waiting": 5,
      "active": 2,
      "completed": 100,
      "failed": 1,
      "delayed": 0
    },
    "automations": {
      "waiting": 3,
      "active": 1,
      "completed": 50,
      "failed": 0,
      "delayed": 0
    },
    "campaigns": {
      "waiting": 0,
      "active": 0,
      "completed": 25,
      "failed": 0,
      "delayed": 0
    },
    "delivery": {
      "waiting": 10,
      "active": 5,
      "completed": 200,
      "failed": 2,
      "delayed": 1
    },
    "housekeeping": {
      "waiting": 0,
      "active": 0,
      "completed": 10,
      "failed": 0,
      "delayed": 0
    }
  },
  "dlq": {
    "events_dead": 1,
    "delivery_dead": 2
  },
  "timestamp": "2025-01-07T08:00:00.000Z",
  "request_id": "req-123"
}
```

**Status Codes:**

- `200 OK` - Always returns 200, even if Redis is down
- `500 Internal Server Error` - Only if queue health check itself fails

### GET /queue/metrics

Detailed queue metrics for monitoring and alerting.

**Response Format:**

```json
{
  "metrics": [
    {
      "queue": "events",
      "waiting": 5,
      "active": 2,
      "completed": 100,
      "failed": 1,
      "delayed": 0
    },
    {
      "queue": "automations",
      "waiting": 3,
      "active": 1,
      "completed": 50,
      "failed": 0,
      "delayed": 0
    }
  ],
  "timestamp": "2025-01-07T08:00:00.000Z",
  "request_id": "req-123"
}
```

**Status Codes:**

- `200 OK` - Queue metrics retrieved successfully
- `503 Service Unavailable` - Redis not available

## Queue Types

### Events Queue

**Purpose:** Process incoming webhook events
**Jobs:** `orders/paid`, `checkouts/update`, `inventory_levels/update`
**Processor:** `src/queue/processors/events.js`

### Automations Queue

**Purpose:** Evaluate automation rules and triggers
**Jobs:** Rule evaluation, consent checks, frequency caps
**Processor:** `src/queue/processors/automations.js`

### Campaigns Queue

**Purpose:** Process campaign sending and audience batching
**Jobs:** `campaigns:batch`, `campaigns:send`
**Processor:** `src/queue/processors/campaigns.js`

### Delivery Queue

**Purpose:** Send SMS messages via Mitto provider
**Jobs:** `delivery:send`, `delivery:retry`
**Processor:** `src/queue/processors/delivery.js`

### Housekeeping Queue

**Purpose:** Maintenance tasks and cleanup
**Jobs:** `housekeeping:cleanup`, `housekeeping:retry`
**Processor:** `src/queue/processors/housekeeping.js`

## Health Checks

### Redis Connectivity

**Check:** `PING` command
**Timeout:** 800ms
**Critical:** Yes

**Response:**

```json
{
  "redis": true
}
```

**Error Response:**

```json
{
  "redis": false,
  "queues": {},
  "dlq": { "events_dead": 0, "delivery_dead": 0 }
}
```

### Queue Counts

**Check:** BullMQ queue methods
**Timeout:** Per-queue timeout
**Critical:** No (graceful degradation)

**Methods Used:**

- `queue.getWaiting()` - Jobs waiting to be processed
- `queue.getActive()` - Jobs currently being processed
- `queue.getCompleted()` - Successfully completed jobs
- `queue.getFailed()` - Failed jobs
- `queue.getDelayed()` - Delayed/scheduled jobs

**Error Handling:**

- Individual queue failures don't affect overall health
- Failed queues return zero counts
- Errors are logged for monitoring

### Dead Letter Queue (DLQ)

**Check:** Failed job counts
**Purpose:** Monitor permanently failed jobs
**Critical:** No (monitoring only)

**Response:**

```json
{
  "dlq": {
    "events_dead": 1,
    "delivery_dead": 2
  }
}
```

## Error Handling

### Redis Connection Errors

```json
{
  "redis": false,
  "queues": {},
  "dlq": { "events_dead": 0, "delivery_dead": 0 },
  "error": "Redis connection failed",
  "timestamp": "2025-01-07T08:00:00.000Z",
  "request_id": "req-123"
}
```

### Queue Count Errors

```json
{
  "redis": true,
  "queues": {
    "events": { "waiting": 0, "active": 0, "completed": 0, "failed": 0, "delayed": 0 },
    "automations": { "waiting": 0, "active": 0, "completed": 0, "failed": 0, "delayed": 0 }
  },
  "dlq": { "events_dead": 0, "delivery_dead": 0 }
}
```

## Monitoring Integration

### Prometheus Metrics

Queue health data is exposed as Prometheus metrics:

```prometheus
# Queue job counts
sms_blossom_queue_jobs_total{queue="events",status="waiting"} 5
sms_blossom_queue_jobs_total{queue="events",status="active"} 2
sms_blossom_queue_jobs_total{queue="events",status="completed"} 100
sms_blossom_queue_jobs_total{queue="events",status="failed"} 1
sms_blossom_queue_jobs_total{queue="events",status="delayed"} 0

# Redis connectivity
sms_blossom_redis_connected 1

# DLQ counts
sms_blossom_dlq_jobs_total{queue="events"} 1
sms_blossom_dlq_jobs_total{queue="delivery"} 2
```

### Alerting Rules

```yaml
# Redis connectivity alert
- alert: RedisDisconnected
  expr: sms_blossom_redis_connected == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: 'Redis connection lost'

# High failed job count
- alert: HighFailedJobs
  expr: sms_blossom_queue_jobs_total{status="failed"} > 10
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: 'High number of failed jobs'

# Queue backlog alert
- alert: QueueBacklog
  expr: sms_blossom_queue_jobs_total{status="waiting"} > 100
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: 'Queue backlog is high'

# DLQ alert
- alert: DeadLetterQueue
  expr: sms_blossom_dlq_jobs_total > 0
  for: 1m
  labels:
    severity: warning
  annotations:
    summary: 'Jobs in dead letter queue'
```

## Performance Monitoring

### Key Metrics

1. **Queue Depth**
   - `waiting` jobs - Backlog size
   - `active` jobs - Current processing load
   - `delayed` jobs - Scheduled jobs

2. **Job Success Rate**
   - `completed` vs `failed` ratio
   - Per-queue success rates
   - Overall system success rate

3. **Processing Time**
   - Job duration metrics
   - Queue processing latency
   - Worker efficiency

4. **Error Rates**
   - Failed job counts
   - DLQ accumulation
   - Retry patterns

### Dashboard Queries

```prometheus
# Queue depth over time
rate(sms_blossom_queue_jobs_total{status="waiting"}[5m])

# Job success rate
rate(sms_blossom_queue_jobs_total{status="completed"}[5m]) /
rate(sms_blossom_queue_jobs_total{status="completed"}[5m] + sms_blossom_queue_jobs_total{status="failed"}[5m])

# Average processing time
rate(sms_blossom_queue_job_duration_seconds_sum[5m]) /
rate(sms_blossom_queue_job_duration_seconds_count[5m])
```

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   - Check Redis server status
   - Verify connection string
   - Check network connectivity
   - Verify Redis authentication

2. **High Queue Backlog**
   - Check worker processes
   - Verify job processing
   - Check for stuck jobs
   - Monitor worker performance

3. **High Failed Job Count**
   - Check job error logs
   - Verify external service connectivity
   - Check job retry configuration
   - Monitor error patterns

4. **DLQ Accumulation**
   - Investigate failed jobs
   - Check error handling
   - Verify retry logic
   - Consider job cleanup

### Debug Commands

```bash
# Check queue health
curl -s https://api.example.com/queue/health | jq

# Check specific queue
curl -s https://api.example.com/queue/health | jq '.queues.events'

# Check Redis status
curl -s https://api.example.com/queue/health | jq '.redis'

# Check DLQ status
curl -s https://api.example.com/queue/health | jq '.dlq'

# Get detailed metrics
curl -s https://api.example.com/queue/metrics | jq
```

### Performance Tuning

1. **Redis Optimization**
   - Tune Redis configuration
   - Optimize connection pooling
   - Monitor memory usage
   - Configure persistence

2. **Queue Configuration**
   - Adjust concurrency settings
   - Tune retry policies
   - Configure backoff strategies
   - Set appropriate timeouts

3. **Worker Scaling**
   - Scale workers based on queue depth
   - Monitor worker performance
   - Optimize job processing
   - Balance load across workers

## Security Considerations

1. **Access Control**
   - Queue health endpoints are public
   - Metrics endpoints may require authentication
   - Limit access to sensitive queue data

2. **Information Disclosure**
   - Queue counts don't expose sensitive data
   - Error messages are generic
   - No job content in health responses

3. **Rate Limiting**
   - Health endpoints should be rate limited
   - Prevent queue health check abuse
   - Monitor for unusual patterns
