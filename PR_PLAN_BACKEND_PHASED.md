# SMS Blossom Backend - Phased Remediation Plan

**Generated:** 2025-01-07  
**Scope:** 2-4 week remediation plan in small PR-sized steps  
**Approach:** Incremental improvements with minimal risk

## Executive Summary

**Total Steps:** 12  
**Estimated Duration:** 3-4 weeks  
**Risk Level:** Low-Medium  
**Success Criteria:** 95% architecture compliance

---

## Phase 1: Critical Security Fixes (Week 1)

### Step 1: Implement App Proxy Signed Request Verification

**Objective:** Secure public endpoints with HMAC verification  
**Affected Files:**

- `src/middleware/appProxyVerify.js` (new)
- `src/proxy/storefront-consent.js`
- `src/proxy/unsubscribe.js`
- `src/routes/public-back-in-stock.js`

**Acceptance Criteria:**

- All public endpoints verify App Proxy signatures
- HMAC verification middleware implemented
- Error handling for invalid signatures
- Tests for signature verification

**Test Strategy:**

- Unit tests for HMAC verification
- Integration tests for public endpoints
- Security tests for signature validation

**Risk & Rollback:**

- Low risk - additive changes
- Rollback: Remove middleware, restore original endpoints

---

### Step 2: Implement PII Encryption at Rest

**Objective:** Encrypt sensitive contact data with AES-GCM  
**Affected Files:**

- `src/lib/encryption.js` (new)
- `src/services/contacts.js`
- `prisma/schema.prisma`
- `prisma/migrations/` (new migration)

**Acceptance Criteria:**

- Phone numbers encrypted at rest
- Email addresses encrypted at rest
- Encryption/decryption functions implemented
- Migration script for existing data

**Test Strategy:**

- Unit tests for encryption/decryption
- Integration tests for contact operations
- Migration tests for data conversion

**Risk & Rollback:**

- Medium risk - data migration required
- Rollback: Revert migration, restore unencrypted data

---

### Step 3: Add GDPR Data Export/Delete Endpoints

**Objective:** Implement REST endpoints for GDPR compliance  
**Affected Files:**

- `src/routes/gdpr.js` (new)
- `src/services/gdpr.js`
- `src/middleware/auth.js`
- `openapi/openapi.yaml`

**Acceptance Criteria:**

- `GET /gdpr/export/{contactId}` endpoint
- `DELETE /gdpr/delete/{contactId}` endpoint
- Data export in JSON format
- Data deletion with audit trail

**Test Strategy:**

- Unit tests for GDPR operations
- Integration tests for endpoints
- Contract tests for OpenAPI compliance

**Risk & Rollback:**

- Low risk - additive changes
- Rollback: Remove endpoints, restore original functionality

---

## Phase 2: Data Model Completion (Week 2)

### Step 4: Add Template Table

**Objective:** Implement template storage system  
**Affected Files:**

- `prisma/schema.prisma`
- `prisma/migrations/` (new migration)
- `src/services/templates.js`
- `src/routes/templates.js`

**Acceptance Criteria:**

- Template table with required fields
- Template CRUD operations
- Template validation
- Template preview functionality

**Test Strategy:**

- Unit tests for template operations
- Integration tests for template endpoints
- Database tests for template storage

**Risk & Rollback:**

- Low risk - additive changes
- Rollback: Remove table, restore original functionality

---

### Step 5: Add Wallet Transaction Table

**Objective:** Implement billing and credits system  
**Affected Files:**

- `prisma/schema.prisma`
- `prisma/migrations/` (new migration)
- `src/services/wallet.js` (new)
- `src/routes/wallet.js` (new)

**Acceptance Criteria:**

- Wallet transaction table
- Credits management
- Cost tracking per country
- Billing integration

**Test Strategy:**

- Unit tests for wallet operations
- Integration tests for billing
- Database tests for transaction storage

**Risk & Rollback:**

- Low risk - additive changes
- Rollback: Remove table, restore original functionality

---

### Step 6: Add Missing Indexes

**Objective:** Optimize database performance  
**Affected Files:**

- `prisma/schema.prisma`
- `prisma/migrations/` (new migration)

**Acceptance Criteria:**

- Composite indexes for common queries
- GIN indexes for JSONB fields
- Partial indexes for filtered queries
- Performance improvement validation

**Test Strategy:**

- Database performance tests
- Query optimization tests
- Index usage validation

**Risk & Rollback:**

- Low risk - additive changes
- Rollback: Remove indexes, restore original performance

---

## Phase 3: Shopify Integration Completion (Week 3)

### Step 7: Implement customerSmsMarketingConsentUpdate

**Objective:** Complete Shopify Admin API integration  
**Affected Files:**

- `src/services/shopify-graphql.js`
- `src/services/consent-unified.js`
- `src/lib/shopify-mutations.js` (new)

**Acceptance Criteria:**

- GraphQL mutation implementation
- Customer consent updates
- Error handling for API failures
- Retry logic for transient errors

**Test Strategy:**

- Unit tests for GraphQL mutations
- Integration tests for consent updates
- Mock tests for Shopify API

**Risk & Rollback:**

- Low risk - additive changes
- Rollback: Remove mutations, restore original functionality

---

### Step 8: Complete App Proxy Implementation

**Objective:** Implement signed request verification for all public endpoints  
**Affected Files:**

- `src/middleware/appProxyVerify.js`
- `src/proxy/storefront-consent.js`
- `src/proxy/unsubscribe.js`
- `src/routes/public-back-in-stock.js`

**Acceptance Criteria:**

- All public endpoints secured
- Signed request verification
- HTML confirmation pages
- Error handling for invalid requests

**Test Strategy:**

- Unit tests for App Proxy verification
- Integration tests for public endpoints
- Security tests for signature validation

**Risk & Rollback:**

- Low risk - additive changes
- Rollback: Remove verification, restore original endpoints

---

### Step 9: Add Missing Relationships

**Objective:** Complete data model relationships  
**Affected Files:**

- `prisma/schema.prisma`
- `prisma/migrations/` (new migration)
- `src/services/campaigns-service.js`
- `src/services/discounts-service.js`

**Acceptance Criteria:**

- Campaign -> Segment relationship
- Campaign -> Discount relationship
- Campaign -> Template relationship
- Foreign key constraints

**Test Strategy:**

- Database relationship tests
- Foreign key constraint tests
- Data integrity tests

**Risk & Rollback:**

- Low risk - additive changes
- Rollback: Remove relationships, restore original schema

---

## Phase 4: Observability and Monitoring (Week 4)

### Step 10: Implement Comprehensive Prometheus Metrics

**Objective:** Add full observability stack  
**Affected Files:**

- `src/lib/metrics.js`
- `src/routes/metrics.js`
- `src/middleware/metrics.js` (new)
- `src/queue/processors/` (all processors)

**Acceptance Criteria:**

- Comprehensive metrics collection
- Prometheus endpoint
- Metrics for all operations
- Alerting rules

**Test Strategy:**

- Unit tests for metrics collection
- Integration tests for metrics endpoints
- Performance tests for metrics overhead

**Risk & Rollback:**

- Low risk - additive changes
- Rollback: Remove metrics, restore original functionality

---

### Step 11: Add Security Monitoring

**Objective:** Implement security alerts and monitoring  
**Affected Files:**

- `src/middleware/securityLogging.js`
- `src/lib/security-monitoring.js` (new)
- `src/routes/security.js` (new)

**Acceptance Criteria:**

- Security event logging
- Anomaly detection
- Intrusion detection
- Security dashboards

**Test Strategy:**

- Unit tests for security monitoring
- Integration tests for security alerts
- Security tests for anomaly detection

**Risk & Rollback:**

- Low risk - additive changes
- Rollback: Remove monitoring, restore original functionality

---

### Step 12: Add Deployment Automation

**Objective:** Implement automated deployment and rollback  
**Affected Files:**

- `.github/workflows/deploy.yml` (new)
- `scripts/deploy.sh` (new)
- `scripts/rollback.sh` (new)
- `docker-compose.prod.yml` (new)

**Acceptance Criteria:**

- Automated deployment pipeline
- Rollback procedures
- Health checks
- Deployment monitoring

**Test Strategy:**

- Deployment tests
- Rollback tests
- Health check tests
- Performance tests

**Risk & Rollback:**

- Medium risk - deployment changes
- Rollback: Manual deployment, restore original process

---

## Risk Assessment

### High Risk Steps

- **Step 2: PII Encryption** - Data migration required
- **Step 12: Deployment Automation** - Production deployment changes

### Medium Risk Steps

- **Step 6: Missing Indexes** - Database performance impact
- **Step 9: Missing Relationships** - Data integrity impact

### Low Risk Steps

- **Steps 1, 3, 4, 5, 7, 8, 10, 11** - Additive changes only

---

## Success Metrics

### Week 1 Targets

- ✅ App Proxy security implemented
- ✅ PII encryption at rest
- ✅ GDPR endpoints functional

### Week 2 Targets

- ✅ Template system complete
- ✅ Billing system functional
- ✅ Database performance optimized

### Week 3 Targets

- ✅ Shopify integration complete
- ✅ App Proxy fully secured
- ✅ Data model relationships complete

### Week 4 Targets

- ✅ Observability stack complete
- ✅ Security monitoring active
- ✅ Deployment automation functional

---

## Rollback Procedures

### Data Migration Rollback

1. Stop application
2. Restore database backup
3. Revert migration
4. Restart application

### Code Rollback

1. Revert git commit
2. Deploy previous version
3. Verify functionality
4. Monitor for issues

### Configuration Rollback

1. Restore configuration files
2. Restart services
3. Verify functionality
4. Monitor for issues

---

## Testing Strategy

### Unit Testing

- 80%+ code coverage
- All new functions tested
- Error scenarios covered

### Integration Testing

- End-to-end workflows tested
- Database operations tested
- External API integrations tested

### Security Testing

- Authentication tested
- Authorization tested
- Input validation tested
- Error handling tested

### Performance Testing

- Response times measured
- Database performance tested
- Memory usage monitored
- CPU usage monitored

---

## Conclusion

This phased approach ensures **minimal risk** while achieving **maximum compliance** with the SMS Blossom v1 Technical Architecture. Each step is designed to be:

- **Small and reviewable** - Easy to review and approve
- **Low risk** - Minimal impact on existing functionality
- **Testable** - Comprehensive test coverage
- **Rollback-able** - Easy to revert if issues arise

**Expected Outcome:** 95% architecture compliance within 4 weeks.

---

_Phased remediation plan generated by SMS Blossom API Audit Suite_
