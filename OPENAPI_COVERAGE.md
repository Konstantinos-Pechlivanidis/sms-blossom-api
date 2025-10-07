# OpenAPI Coverage Analysis

## OpenAPI vs Implementation Coverage Matrix

### Health Endpoints ✅ **FULLY COVERED**

| Path      | Method | OpenAPI | Implementation         | Status       |
| --------- | ------ | ------- | ---------------------- | ------------ |
| `/health` | GET    | ✅      | `src/routes/health.js` | ✅ **MATCH** |

### Public App Proxy Endpoints ⚠️ **PARTIALLY COVERED**

| Path                             | Method | OpenAPI | Implementation                       | Status       |
| -------------------------------- | ------ | ------- | ------------------------------------ | ------------ |
| `/public/storefront/consent`     | POST   | ✅      | `src/proxy/storefront-consent.js`    | ✅ **MATCH** |
| `/public/unsubscribe`            | GET    | ✅      | `src/proxy/unsubscribe.js`           | ✅ **MATCH** |
| `/public/back-in-stock/interest` | POST   | ✅      | `src/routes/public-back-in-stock.js` | ✅ **MATCH** |

### Discounts Endpoints ❌ **MISSING IMPLEMENTATION**

| Path                   | Method | OpenAPI | Implementation            | Status         |
| ---------------------- | ------ | ------- | ------------------------- | -------------- |
| `/discounts`           | POST   | ✅      | `src/routes/discounts.js` | ❌ **MISSING** |
| `/discounts/apply-url` | GET    | ✅      | `src/routes/discounts.js` | ❌ **MISSING** |
| `/discounts/conflicts` | GET    | ✅      | `src/routes/discounts.js` | ❌ **MISSING** |

### Settings Endpoints ❌ **MISSING IMPLEMENTATION**

| Path        | Method | OpenAPI | Implementation           | Status         |
| ----------- | ------ | ------- | ------------------------ | -------------- |
| `/settings` | GET    | ✅      | `src/routes/settings.js` | ❌ **MISSING** |
| `/settings` | PUT    | ✅      | `src/routes/settings.js` | ❌ **MISSING** |

### Automations Endpoints ❌ **MISSING IMPLEMENTATION**

| Path           | Method | OpenAPI | Implementation              | Status         |
| -------------- | ------ | ------- | --------------------------- | -------------- |
| `/automations` | GET    | ✅      | `src/routes/automations.js` | ❌ **MISSING** |
| `/automations` | PUT    | ✅      | `src/routes/automations.js` | ❌ **MISSING** |

### Segments Endpoints ❌ **MISSING IMPLEMENTATION**

| Path                | Method | OpenAPI | Implementation           | Status         |
| ------------------- | ------ | ------- | ------------------------ | -------------- |
| `/segments`         | POST   | ✅      | `src/routes/segments.js` | ❌ **MISSING** |
| `/segments/preview` | POST   | ✅      | `src/routes/segments.js` | ❌ **MISSING** |

### Campaigns Endpoints ❌ **MISSING IMPLEMENTATION**

| Path                              | Method | OpenAPI | Implementation            | Status         |
| --------------------------------- | ------ | ------- | ------------------------- | -------------- |
| `/campaigns/{id}/snapshot`        | POST   | ✅      | `src/routes/campaigns.js` | ❌ **MISSING** |
| `/campaigns/{id}/estimate`        | GET    | ✅      | `src/routes/campaigns.js` | ❌ **MISSING** |
| `/campaigns/{id}/test-send`       | POST   | ✅      | `src/routes/campaigns.js` | ❌ **MISSING** |
| `/campaigns/{id}/send-now`        | POST   | ✅      | `src/routes/campaigns.js` | ❌ **MISSING** |
| `/campaigns/{id}/attach-discount` | POST   | ✅      | `src/routes/campaigns.js` | ❌ **MISSING** |
| `/campaigns/{id}/detach-discount` | POST   | ✅      | `src/routes/campaigns.js` | ❌ **MISSING** |
| `/campaigns/{id}/utm`             | PUT    | ✅      | `src/routes/campaigns.js` | ❌ **MISSING** |
| `/campaigns/{id}/apply-url`       | GET    | ✅      | `src/routes/campaigns.js` | ❌ **MISSING** |

### Reports Endpoints ❌ **MISSING IMPLEMENTATION**

| Path                            | Method | OpenAPI | Implementation          | Status         |
| ------------------------------- | ------ | ------- | ----------------------- | -------------- |
| `/reports/overview`             | GET    | ✅      | `src/routes/reports.js` | ❌ **MISSING** |
| `/reports/attribution`          | GET    | ✅      | `src/routes/reports.js` | ❌ **MISSING** |
| `/reports/campaigns`            | GET    | ✅      | `src/routes/reports.js` | ❌ **MISSING** |
| `/reports/automations`          | GET    | ✅      | `src/routes/reports.js` | ❌ **MISSING** |
| `/reports/messaging/timeseries` | GET    | ✅      | `src/routes/reports.js` | ❌ **MISSING** |

### Webhooks Endpoints ⚠️ **PARTIALLY COVERED**

| Path                        | Method | OpenAPI | Implementation                  | Status       |
| --------------------------- | ------ | ------- | ------------------------------- | ------------ |
| `/webhooks/shopify/{topic}` | POST   | ✅      | `src/webhooks/shopify.js`       | ✅ **MATCH** |
| `/webhooks/mitto/dlr`       | POST   | ✅      | `src/webhooks/mitto-dlr.js`     | ✅ **MATCH** |
| `/webhooks/mitto/inbound`   | POST   | ✅      | `src/webhooks/mitto-inbound.js` | ✅ **MATCH** |
| `/webhooks/gdpr/{topic}`    | POST   | ✅      | `src/webhooks/gdpr.js`          | ✅ **MATCH** |

## Schema Coverage Analysis

### Request/Response Schema Mismatches

#### 1. **ConsentRequest Schema**

- **OpenAPI:** `phone`, `email`, `optInLevel`
- **Implementation:** Missing validation middleware
- **Gap:** No request validation

#### 2. **DiscountCreateRequest Schema**

- **OpenAPI:** `code`, `title`, `kind`, `value`, `currencyCode`, etc.
- **Implementation:** Missing discount service
- **Gap:** No discount creation logic

#### 3. **SettingsGetResponse Schema**

- **OpenAPI:** `timezone`, `quietHours`, `cap`, `abandoned`
- **Implementation:** Missing settings service
- **Gap:** No settings management

#### 4. **ReportOverviewResponse Schema**

- **OpenAPI:** `contacts`, `messages`, `revenue`
- **Implementation:** Partial in `src/services/reports.js`
- **Gap:** Missing revenue attribution

### Authentication & Authorization Gaps

#### 1. **Missing JWT Verification**

- **OpenAPI:** No security schemes defined
- **Implementation:** No JWT middleware
- **Gap:** No bearer token authentication

#### 2. **Missing Shop Scoping**

- **OpenAPI:** All endpoints require `shop` parameter
- **Implementation:** No shop validation middleware
- **Gap:** No tenant isolation

#### 3. **Missing Rate Limiting**

- **OpenAPI:** No rate limiting defined
- **Implementation:** No rate limiting middleware
- **Gap:** No API protection

## Critical Missing Implementations

### 1. **Core Business Logic (80% missing)**

- Discount management service
- Campaign management service
- Settings management service
- Segment management service

### 2. **Reporting System (90% missing)**

- Overview KPIs
- Campaign attribution
- Automation attribution
- Messaging timeseries

### 3. **Template Engine (100% missing)**

- Liquid template rendering
- Custom filters
- Template validation

### 4. **Queue System (70% missing)**

- BullMQ integration
- Job processing
- Retry logic
- Dead letter queues

## Recommendations

### Immediate Actions (Week 1)

1. **Implement missing route handlers** for all OpenAPI endpoints
2. **Add request validation middleware** using AJV
3. **Implement shop scoping middleware** for tenant isolation
4. **Add JWT authentication middleware**

### Short-term Actions (Week 2-3)

1. **Build core services** (discounts, campaigns, settings)
2. **Implement template engine** with Liquid
3. **Set up Redis/BullMQ queues**
4. **Add comprehensive error handling**

### Long-term Actions (Month 1-2)

1. **Implement reporting system**
2. **Add security middleware**
3. **Build comprehensive testing**
4. **Add monitoring and observability**

## Coverage Summary

- **Total OpenAPI Endpoints:** 25
- **Implemented:** 7 (28%)
- **Partially Implemented:** 3 (12%)
- **Missing:** 15 (60%)

**Overall OpenAPI Coverage: 40%**
