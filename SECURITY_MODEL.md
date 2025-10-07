# Security Model

This document describes the comprehensive security model implemented in the SMS Blossom API.

## Overview

The security model provides multiple layers of protection:

1. **Authentication** - JWT and Shopify session token verification
2. **Authorization** - Shop scoping and access control
3. **Rate Limiting** - Token bucket algorithm with Redis
4. **CSRF Protection** - Double-submit token pattern
5. **Input Validation** - Zod schema validation
6. **Security Logging** - PII redaction and audit trails

## Authentication

### JWT Authentication

The API supports JWT tokens for admin API access:

```javascript
// Generate JWT token
const token = generateJwtToken({
  shop_domain: 'shop.myshopify.com',
  user_id: 'user-123',
  scopes: ['read_products', 'write_orders']
});

// Use in requests
Authorization: Bearer <jwt-token>
```

**JWT Claims:**

- `shop_domain` - Target shop domain
- `user_id` - User identifier (optional)
- `scopes` - Permission scopes (optional)
- `iat` - Issued at timestamp
- `exp` - Expiration timestamp

### Shopify Session Token Authentication

For Shopify app contexts, the API verifies Shopify session tokens:

```javascript
// Shopify session token verification
const sessionToken = req.headers.authorization?.replace('Bearer ', '');
const decoded = await verifyShopifySessionToken(sessionToken);
```

**Session Token Claims:**

- `dest` - Shop domain
- `aud` - App identifier
- `iss` - Issuer (Shopify)
- `exp` - Expiration

### Authentication Middleware

```javascript
// Required authentication
app.get('/admin/campaigns', requiredAuthMiddleware(), (req, res) => {
  // req.auth contains decoded token claims
});

// Optional authentication
app.get('/public/health', optionalAuthMiddleware(), (req, res) => {
  // req.auth may be undefined
});
```

## Authorization

### Shop Scoping

All requests are scoped to a specific shop:

```javascript
// Shop resolution order:
// 1. JWT token claims (dest field)
// 2. X-Shop-Domain header
// 3. ?shop query parameter

app.get('/shop-data', requiredAuthMiddleware(), shopScopingMiddleware(), (req, res) => {
  // req.shop contains { id, domain, tz, locale }
});
```

**Shop Resolution:**

1. **JWT Token** - `req.auth.dest` field
2. **Header** - `X-Shop-Domain: shop.myshopify.com`
3. **Query** - `?shop=shop.myshopify.com`

**Error Responses:**

- `400` - Shop domain required
- `409` - Shop not installed (with install URL)

### Access Control

Shop scoping ensures data isolation:

```javascript
// All database queries are automatically scoped
const campaigns = await prisma.campaign.findMany({
  where: {
    shopId: req.shop.id, // Automatically scoped
    status: 'active',
  },
});
```

## Rate Limiting

### Token Bucket Algorithm

Rate limiting uses Redis-backed token bucket:

```javascript
// Admin API rate limiting
app.use('/admin', adminRateLimitMiddleware());

// Public API rate limiting
app.use('/public', publicRateLimitMiddleware());

// Webhook rate limiting
app.use('/webhooks', webhookRateLimitMiddleware());
```

**Rate Limits:**

- **Admin API**: 60 rps burst, 600 rpm sustained
- **Public API**: 10 rps burst, 100 rpm sustained
- **Webhooks**: 1000 rpm, 100 rps burst

**Rate Limit Headers:**

```
RateLimit-Limit: 60
RateLimit-Remaining: 45
RateLimit-Reset: 2024-01-01T12:00:00Z
Retry-After: 30
```

**Error Response:**

```json
{
  "error": "rate_limited",
  "message": "Too many requests",
  "retry_after": 30
}
```

### Rate Limit Keys

Rate limits are applied per:

- **Admin API**: `admin_rate_limit:{shop_id}:{ip}`
- **Public API**: `public_rate_limit:{ip}`
- **Webhooks**: `webhook_rate_limit:{shop_id}`

## CSRF Protection

### Double-Submit Token Pattern

CSRF protection uses double-submit tokens:

```javascript
// CSRF middleware
app.use(
  csrfMiddleware({
    secret: process.env.CSRF_SECRET,
    cookieName: 'csrf-token',
    headerName: 'x-csrf-token',
  }),
);
```

**CSRF Flow:**

1. **GET Request** - Server generates CSRF token
2. **Token Storage** - Set in cookie and response header
3. **POST Request** - Client sends token in both cookie and header
4. **Verification** - Server verifies tokens match

**CSRF Exemptions:**

- GET, HEAD, OPTIONS requests
- Bearer token authentication
- Webhook endpoints
- Health check endpoints

**Error Responses:**

- `403` - CSRF token missing/mismatch/invalid

## Input Validation

### Zod Schema Validation

All inputs are validated using Zod schemas:

```javascript
// Request validation
app.post(
  '/campaigns',
  validateRequest({
    body: commonSchemas.campaignCreate,
    query: commonSchemas.pagination,
  }),
  (req, res) => {
    // req.body and req.query are validated
  },
);
```

**Common Schemas:**

- `shopDomain` - Shopify domain format
- `phoneE164` - E.164 phone number format
- `email` - Email validation
- `uuid` - UUID format
- `pagination` - Page/limit/sort parameters

**Validation Error Response:**

```json
{
  "error": "validation_failed",
  "message": "Request validation failed",
  "details": [
    {
      "field": "body",
      "errors": [
        {
          "path": "name",
          "message": "Campaign name is required",
          "code": "too_small"
        }
      ]
    }
  ]
}
```

### Input Sanitization

All inputs are sanitized to prevent XSS:

```javascript
// Sanitization middleware
app.use(sanitizeMiddleware());

// Sanitizes:
// - HTML tags: <script> -> script
// - Quotes: "value" -> value
// - Special characters
```

## Security Logging

### PII Redaction

All logs redact sensitive information:

```javascript
// Sensitive fields are automatically redacted:
// - password, token, secret, key, auth
// - phone, email, ssn, credit_card
// - access_token, refresh_token, api_key
// - phoneE164, customer_email, etc.

logger.info('Request completed', {
  request_id: 'req-123',
  shop_domain: 'shop.myshopify.com',
  // Sensitive data is redacted as [REDACTED]
});
```

### Security Events

Security events are logged with context:

```javascript
// Authentication events
logAuthEvent('login_success', {
  shop_domain: 'shop.myshopify.com',
  user_id: 'user-123',
});

// Security violations
logSecurityViolation('rate_limit_exceeded', {
  shop_domain: 'shop.myshopify.com',
  ip: '192.168.1.1',
  limit: 60,
  current: 65,
});
```

### Log Structure

All security logs include:

- `request_id` - Unique request identifier
- `shop_domain` - Shop context
- `route` - HTTP method and path
- `status_code` - Response status
- `outcome` - success/error
- `duration_ms` - Request duration
- `error_type` - Security error classification

## Environment Variables

### Required Security Configuration

```bash
# JWT/Session secrets
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret
CSRF_SECRET=your-csrf-secret

# Encryption
ENCRYPTION_KEY=your-encryption-key

# Shopify
SHOPIFY_API_KEY=your-api-key
SHOPIFY_API_SECRET=your-api-secret
WEBHOOK_HMAC_SECRET=your-webhook-secret

# Redis (for rate limiting)
REDIS_URL=redis://localhost:6379

# CORS
CORS_ALLOWLIST=https://your-frontend.com,https://admin.shopify.com
```

### Security Headers

The API sets security headers:

```javascript
// Security headers
res.set({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'",
});
```

## Error Handling

### Security Error Types

```javascript
// Authentication errors
401 - Unauthorized (invalid/missing token)
409 - Conflict (shop not installed)

// Rate limiting errors
429 - Too Many Requests (rate limit exceeded)

// CSRF errors
403 - Forbidden (CSRF token issues)

// Validation errors
400 - Bad Request (input validation failed)
```

### Error Response Format

```json
{
  "error": "error_code",
  "message": "Human readable message",
  "retry_after": 30, // For rate limiting
  "install_url": "https://app.com/install?shop=...", // For shop not installed
  "details": [...] // For validation errors
}
```

## Best Practices

### Development

1. **Always use middleware** - Apply security middleware to all routes
2. **Validate inputs** - Use Zod schemas for all user inputs
3. **Scope data** - Always include shop context in queries
4. **Log security events** - Monitor authentication and authorization
5. **Test security** - Include security tests in test suite

### Production

1. **Rotate secrets** - Regularly rotate JWT and session secrets
2. **Monitor logs** - Set up alerts for security violations
3. **Rate limit monitoring** - Monitor rate limit usage patterns
4. **PII compliance** - Ensure PII redaction is working correctly
5. **Security headers** - Verify security headers are set

### Testing

```javascript
// Test authentication
expect(response.status).toBe(401);
expect(response.body.error).toBe('unauthorized');

// Test shop scoping
expect(response.status).toBe(409);
expect(response.body.error).toBe('shop_not_installed');

// Test rate limiting
expect(response.status).toBe(429);
expect(response.body.error).toBe('rate_limited');
```

## Security Checklist

- [ ] JWT tokens are properly signed and verified
- [ ] Shop scoping is applied to all database queries
- [ ] Rate limiting is configured for all endpoints
- [ ] CSRF protection is enabled for cookie-based sessions
- [ ] Input validation is applied to all user inputs
- [ ] PII is redacted from all logs
- [ ] Security events are logged and monitored
- [ ] Error responses don't leak sensitive information
- [ ] Environment variables are properly configured
- [ ] Security headers are set on all responses
