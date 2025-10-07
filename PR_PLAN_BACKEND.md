# SMS Blossom v1 Backend Remediation Plan

## Overview

This plan addresses the critical gaps identified in the architecture audit to bring the SMS Blossom backend to production readiness.

**Current State:** 65% implemented
**Target State:** 95% implemented
**Timeline:** 4-6 weeks

---

## Phase 1: Core Infrastructure (Week 1-2)

### Step 1: Template Engine Implementation

**Objective:** Implement Liquid template engine with custom filters
**Priority:** CRITICAL
**Effort:** 3 days

**Files to Create/Modify:**

- `src/services/templates.js` - Template service
- `src/lib/liquid-filters.js` - Custom filters
- `src/routes/templates.js` - Template endpoints
- `tests/templates.test.js` - Template tests

**Acceptance Criteria:**

- [ ] Liquid template rendering works
- [ ] Custom filters: money, date, shortlink, default, titlecase
- [ ] Template validation and linting
- [ ] Preview/test harness
- [ ] Unit tests with 90% coverage

**Test Strategy:**

- Unit tests for template rendering
- Integration tests for filter functions
- E2E tests for template endpoints

---

### Step 2: Redis/BullMQ Queue System

**Objective:** Implement production-ready queue system
**Priority:** CRITICAL
**Effort:** 4 days

**Files to Create/Modify:**

- `src/queue/queues.js` - Queue definitions
- `src/queue/processors/` - Job processors
- `src/queue/retry.js` - Retry logic
- `src/queue/dlx.js` - Dead letter queue
- `src/workers/` - Worker processes

**Acceptance Criteria:**

- [ ] Event processing queue
- [ ] Campaign sending queue
- [ ] Delivery receipt queue
- [ ] Reporting queue
- [ ] Backoff strategies (exponential, linear)
- [ ] Dead letter queue for failed jobs
- [ ] Graceful shutdown handling
- [ ] Repeatable jobs for housekeeping

**Test Strategy:**

- Unit tests for queue operations
- Integration tests for job processing
- Load tests for queue performance

---

### Step 3: Security Middleware

**Objective:** Implement comprehensive security layer
**Priority:** HIGH
**Effort:** 3 days

**Files to Create/Modify:**

- `src/middleware/auth.js` - JWT authentication
- `src/middleware/rateLimit.js` - Rate limiting
- `src/middleware/csrf.js` - CSRF protection
- `src/middleware/shopScope.js` - Tenant isolation
- `src/lib/security.js` - Security utilities

**Acceptance Criteria:**

- [ ] JWT verification middleware
- [ ] Rate limiting per shop/IP
- [ ] CSRF protection for cookie flows
- [ ] Shop scoping for all DB operations
- [ ] Request validation middleware
- [ ] Security headers middleware

**Test Strategy:**

- Security tests for authentication
- Rate limiting tests
- CSRF protection tests
- Tenant isolation tests

---

## Phase 2: Core Business Logic (Week 2-3)

### Step 4: Discount Service Implementation

**Objective:** Build Shopify discount management
**Priority:** HIGH
**Effort:** 4 days

**Files to Create/Modify:**

- `src/services/discounts.js` - Discount service
- `src/services/shopify-graphql.js` - GraphQL client
- `src/routes/discounts.js` - Discount endpoints
- `src/lib/discount-utils.js` - Discount utilities
- `tests/discounts.test.js` - Discount tests

**Acceptance Criteria:**

- [ ] Shopify Admin GraphQL integration
- [ ] Discount creation/update
- [ ] Conflict detection
- [ ] Apply URL builder
- [ ] UTM parameter injection
- [ ] Discount validation

**Test Strategy:**

- Unit tests for discount logic
- Integration tests with Shopify API
- Mock tests for GraphQL calls

---

### Step 5: Campaign Management System

**Objective:** Build campaign creation and management
**Priority:** CRITICAL
**Effort:** 5 days

**Files to Create/Modify:**

- `src/services/campaigns.js` - Campaign service
- `src/services/segments.js` - Segment service
- `src/routes/campaigns.js` - Campaign endpoints
- `src/routes/segments.js` - Segment endpoints
- `src/services/campaign-sender.js` - Campaign sending
- `tests/campaigns.test.js` - Campaign tests

**Acceptance Criteria:**

- [ ] Campaign CRUD operations
- [ ] Segment management
- [ ] Audience snapshot
- [ ] Campaign scheduling
- [ ] Test send functionality
- [ ] Campaign attribution
- [ ] UTM parameter management

**Test Strategy:**

- Unit tests for campaign logic
- Integration tests for segment filtering
- E2E tests for campaign flow

---

### Step 6: Settings Management

**Objective:** Implement shop settings and rules
**Priority:** MEDIUM
**Effort:** 2 days

**Files to Create/Modify:**

- `src/services/settings.js` - Settings service
- `src/routes/settings.js` - Settings endpoints
- `src/services/rules.js` - Rules engine
- `tests/settings.test.js` - Settings tests

**Acceptance Criteria:**

- [ ] Shop settings CRUD
- [ ] Quiet hours configuration
- [ ] Frequency caps
- [ ] Abandoned checkout settings
- [ ] Rules engine evaluation
- [ ] Settings validation

**Test Strategy:**

- Unit tests for settings logic
- Integration tests for rules engine
- Validation tests for settings

---

## Phase 3: Advanced Features (Week 3-4)

### Step 7: Reporting System Enhancement

**Objective:** Build comprehensive reporting
**Priority:** HIGH
**Effort:** 4 days

**Files to Create/Modify:**

- `src/services/reports.js` - Enhanced reporting
- `src/services/cache.js` - Redis caching
- `src/routes/reports.js` - Report endpoints
- `src/lib/metrics.js` - Metrics collection
- `tests/reports.test.js` - Report tests

**Acceptance Criteria:**

- [ ] Overview KPIs
- [ ] Campaign attribution
- [ ] Automation attribution
- [ ] Messaging timeseries
- [ ] Redis caching layer
- [ ] Cache headers
- [ ] Performance optimization

**Test Strategy:**

- Unit tests for report calculations
- Integration tests for caching
- Performance tests for large datasets

---

### Step 8: Observability & Monitoring

**Objective:** Add comprehensive monitoring
**Priority:** MEDIUM
**Effort:** 3 days

**Files to Create/Modify:**

- `src/lib/metrics.js` - Prometheus metrics
- `src/lib/tracing.js` - OpenTelemetry tracing
- `src/middleware/metrics.js` - Metrics middleware
- `src/lib/health.js` - Enhanced health checks
- `tests/observability.test.js` - Observability tests

**Acceptance Criteria:**

- [ ] Prometheus metrics endpoint
- [ ] API latency metrics
- [ ] Queue depth metrics
- [ ] Job latency metrics
- [ ] DLR rate metrics
- [ ] OpenTelemetry tracing
- [ ] Enhanced health checks

**Test Strategy:**

- Metrics collection tests
- Tracing tests
- Health check tests

---

## Phase 4: Testing & Quality (Week 4-5)

### Step 9: Comprehensive Testing

**Objective:** Build complete test suite
**Priority:** HIGH
**Effort:** 4 days

**Files to Create/Modify:**

- `tests/unit/` - Unit tests
- `tests/integration/` - Integration tests
- `tests/e2e/` - End-to-end tests
- `tests/fixtures/` - Test fixtures
- `tests/mocks/` - Mock services

**Acceptance Criteria:**

- [ ] Unit tests for all services
- [ ] Integration tests for webhooks
- [ ] E2E tests for user flows
- [ ] Mock services for external APIs
- [ ] Test coverage > 90%
- [ ] Performance tests

**Test Strategy:**

- Unit test coverage analysis
- Integration test automation
- E2E test scenarios
- Performance benchmarking

---

### Step 10: Documentation & Deployment

**Objective:** Complete documentation and deployment
**Priority:** MEDIUM
**Effort:** 2 days

**Files to Create/Modify:**

- `README.md` - Updated documentation
- `DEPLOYMENT.md` - Deployment guide
- `API.md` - API documentation
- `ENVIRONMENT.md` - Environment variables
- `.github/workflows/` - CI/CD pipelines

**Acceptance Criteria:**

- [ ] Complete API documentation
- [ ] Deployment instructions
- [ ] Environment variable documentation
- [ ] CI/CD pipeline
- [ ] Monitoring setup

**Test Strategy:**

- Documentation review
- Deployment testing
- CI/CD pipeline validation

---

## Risk Mitigation

### High-Risk Items

1. **Template Engine Complexity** - Liquid integration may be complex
2. **Queue System Performance** - Redis/BullMQ setup critical
3. **Shopify API Integration** - External dependency
4. **Security Implementation** - Critical for production

### Mitigation Strategies

1. **Incremental Development** - Build and test each component
2. **Mock External Services** - Use mocks for development
3. **Comprehensive Testing** - Test all integrations
4. **Security Review** - External security audit

---

## Success Metrics

### Technical Metrics

- [ ] Test coverage > 90%
- [ ] API response time < 200ms
- [ ] Queue processing < 1s
- [ ] Zero security vulnerabilities

### Business Metrics

- [ ] All OpenAPI endpoints implemented
- [ ] Campaign management functional
- [ ] Reporting system complete
- [ ] Production deployment ready

---

## Timeline Summary

| Week | Focus             | Deliverables                            |
| ---- | ----------------- | --------------------------------------- |
| 1    | Infrastructure    | Template Engine, Redis/BullMQ, Security |
| 2    | Business Logic    | Discounts, Campaigns, Settings          |
| 3    | Advanced Features | Reporting, Observability                |
| 4    | Testing & Quality | Comprehensive testing, Documentation    |
| 5    | Deployment        | Production deployment, Monitoring       |

**Total Effort:** 4-5 weeks
**Team Size:** 2-3 developers
**Risk Level:** Medium
