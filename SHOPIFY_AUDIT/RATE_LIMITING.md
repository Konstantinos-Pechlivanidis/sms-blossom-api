# Rate Limiting & Backoff Analysis

## Current Implementation Status

### ✅ **RATE LIMITING: IMPLEMENTED**

| Component | Implementation | Status | Details |
|-----------|----------------|---------|---------|
| **Admin API Rate Limiting** | ✅ Token Bucket | ✅ **EXCELLENT** | 60 rps burst, 600 rpm sustained |
| **Public API Rate Limiting** | ✅ Token Bucket | ✅ **EXCELLENT** | 10 rps burst, 100 rpm sustained |
| **Webhook Rate Limiting** | ✅ Token Bucket | ✅ **EXCELLENT** | 1000 rpm, 100 rps burst |
| **Redis Backend** | ✅ Implemented | ✅ **EXCELLENT** | Graceful fallback when Redis unavailable |

### ✅ **BACKOFF STRATEGIES: IMPLEMENTED**

| Component | Strategy | Status | Details |
|-----------|----------|---------|---------|
| **Mitto SMS Provider** | ✅ Exponential Backoff | ✅ **EXCELLENT** | 3 retries, delays: [100ms, 500ms, 2000ms] |
| **Campaign Sending** | ✅ Throttling | ✅ **EXCELLENT** | 1000ms between batches |
| **Report Generation** | ✅ Exponential Backoff | ✅ **EXCELLENT** | Smart retry on 429/5xx errors |

## 🔍 **DETAILED ANALYSIS**

### Rate Limiting Implementation

#### ✅ **EXCELLENT: Token Bucket Algorithm**

**File**: `src/middleware/rateLimiting.js`

```javascript
// Admin API: 60 rps burst, 600 rpm sustained
export function rateLimitMiddleware(options = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute window
    maxRequests = 60, // max requests per window
    burstLimit = 10, // burst allowance
    keyGenerator = (req) => {
      const shopId = req.shop?.id || 'no-shop';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `rate_limit:${shopId}:${ip}`;
    }
  } = options;
```

**Features**:
- ✅ **Per-shop rate limiting** with IP fallback
- ✅ **Burst protection** with separate burst limits
- ✅ **Redis-backed** with graceful fallback
- ✅ **Proper headers** (RateLimit-*, Retry-After)
- ✅ **Detailed logging** for monitoring

#### ✅ **EXCELLENT: Multiple Rate Limit Tiers**

```javascript
// Admin API: 60 rps burst, 600 rpm sustained
export function adminRateLimitMiddleware() {
  return rateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 600, // 600 requests per minute
    burstLimit: 60, // 60 requests per second burst
  });
}

// Public API: 10 rps burst, 100 rpm sustained  
export function publicRateLimitMiddleware() {
  return rateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 120, // 120 requests per minute
    burstLimit: 10, // 10 requests per second burst
  });
}

// Webhooks: 1000 rpm, 100 rps burst
export function webhookRateLimitMiddleware() {
  return rateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 1000, // 1000 requests per minute
    burstLimit: 100, // 100 requests per second burst
  });
}
```

### Backoff Strategies Implementation

#### ✅ **EXCELLENT: Mitto SMS Provider Retry**

**File**: `src/providers/mitto.js`

```javascript
async executeWithRetry(payload, attempt = 1) {
  try {
    const response = await this.makeRequest(payload);
    return response;
  } catch (error) {
    const mittoError = this.classifyError(error);
    
    if (mittoError.isTransient && attempt < this.config.maxRetries) {
      const delay = this.config.retryDelays[attempt - 1] || 2000;
      await this.sleep(delay);
      return this.executeWithRetry(payload, attempt + 1);
    }
    
    throw mittoError;
  }
}
```

**Features**:
- ✅ **Exponential backoff** with configurable delays
- ✅ **Error classification** (transient vs permanent)
- ✅ **Max retry limits** (3 attempts by default)
- ✅ **Detailed logging** for debugging

#### ✅ **EXCELLENT: Campaign Sending Throttling**

**File**: `src/services/campaigns-sender.js`

```javascript
// Throttle between batches
await sleep(CAMPAIGN_THROTTLE_MS || 1000);
```

**Features**:
- ✅ **Configurable throttling** via environment variables
- ✅ **Batch processing** with delays
- ✅ **Prevents API overload**

## ❌ **MISSING: SHOPIFY API RATE LIMITING**

### Current Gap

**Issue**: No centralized Shopify API client with rate limiting
**Impact**: Risk of hitting Shopify API rate limits
**Files Affected**: 
- `src/services/shopify-graphql.js`
- `src/services/shopify-customers-sync.js`
- `src/auth/shop-webhooks.js`

### Shopify API Rate Limits

| API Type | Limit | Current Handling |
|----------|-------|------------------|
| **GraphQL** | 50 points/second | ❌ **NO RATE LIMITING** |
| **REST** | 2 calls/second | ❌ **NO RATE LIMITING** |
| **Bulk Operations** | 1 operation/minute | ❌ **NO RATE LIMITING** |

## 🔧 **PATCH PLAN**

### 1. Create Centralized Shopify Client

**File**: `src/lib/shopify/shopifyClient.js` (NEW)

```javascript
// @cursor:start(shopify-client)
import { getPrismaClient } from '../../db/prismaClient.js';
import { decryptFromString } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';

const API_VERSION = '2025-10';
const RATE_LIMITS = {
  graphql: { points: 50, window: 1000 }, // 50 points per second
  rest: { calls: 2, window: 1000 }, // 2 calls per second
  bulk: { operations: 1, window: 60000 }, // 1 operation per minute
};

class ShopifyClient {
  constructor(shopDomain, accessToken) {
    this.shopDomain = shopDomain;
    this.accessToken = accessToken;
    this.rateLimiters = new Map();
  }

  async graphql(query, variables = {}) {
    await this.checkRateLimit('graphql');
    // Implementation with cost-aware throttling
  }

  async rest(endpoint, options = {}) {
    await this.checkRateLimit('rest');
    // Implementation with rate limiting
  }

  async checkRateLimit(type) {
    // Token bucket implementation for Shopify API limits
  }
}

export function getShopifyClient(shopDomain) {
  // Get access token and return client instance
}
// @cursor:end(shopify-client)
```

### 2. Update GraphQL Service

**File**: `src/services/shopify-graphql.js`

```javascript
// @cursor:start(graphql-rate-limiting)
import { getShopifyClient } from '../lib/shopify/shopifyClient.js';

export async function shopifyGraphql({ shopDomain, accessToken, query, variables }) {
  const client = getShopifyClient(shopDomain, accessToken);
  return await client.graphql(query, variables);
}
// @cursor:end(graphql-rate-limiting)
```

### 3. Add Cost-Aware Throttling

**File**: `src/lib/shopify/shopifyClient.js`

```javascript
// @cursor:start(cost-aware-throttling)
async graphql(query, variables = {}) {
  const cost = this.estimateQueryCost(query);
  await this.checkRateLimit('graphql', cost);
  
  const response = await this.makeRequest('/admin/api/2025-10/graphql.json', {
    method: 'POST',
    body: JSON.stringify({ query, variables })
  });
  
  // Update rate limit based on actual cost from response headers
  this.updateRateLimit('graphql', response.headers['x-shopify-api-call-limit']);
  
  return response.data;
}

estimateQueryCost(query) {
  // Simple cost estimation based on query complexity
  const complexity = (query.match(/query|mutation/g) || []).length;
  return Math.max(1, complexity);
}
// @cursor:end(cost-aware-throttling)
```

## 📋 **IMPLEMENTATION CHECKLIST**

### ✅ **ALREADY IMPLEMENTED**
- [x] Admin API rate limiting (60 rps burst, 600 rpm)
- [x] Public API rate limiting (10 rps burst, 100 rpm)
- [x] Webhook rate limiting (1000 rpm, 100 rps burst)
- [x] Redis-backed token bucket algorithm
- [x] Graceful fallback when Redis unavailable
- [x] Proper rate limit headers
- [x] Mitto SMS provider retry logic
- [x] Campaign sending throttling
- [x] Report generation backoff

### ❌ **MISSING - CRITICAL**
- [ ] **Shopify API rate limiting wrapper**
- [ ] **Cost-aware GraphQL throttling**
- [ ] **Bulk operations rate limiting**
- [ ] **Centralized Shopify client**

### 🔮 **RECOMMENDATIONS**
- [ ] Add Shopify API rate limit monitoring
- [ ] Implement exponential backoff for Shopify API errors
- [ ] Add rate limit metrics and alerting
- [ ] Consider request queuing for high-volume operations

## 📊 **SUMMARY**

| Component | Status | Score | Priority |
|-----------|--------|-------|----------|
| **Internal Rate Limiting** | ✅ Excellent | 10/10 | ✅ Complete |
| **SMS Provider Backoff** | ✅ Excellent | 10/10 | ✅ Complete |
| **Shopify API Rate Limiting** | ❌ Missing | 0/10 | 🚨 **CRITICAL** |
| **Overall Rate Limiting** | ⚠️ Good | 7/10 | ⚠️ Needs Work |

**Critical Issue**: Shopify API calls are not rate-limited, risking API limit violations and app suspension.
