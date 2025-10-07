# Security Surface

This document describes the security model, authentication flows, and security measures implemented in the SMS Blossom backend.

## Security Overview

The SMS Blossom backend implements a comprehensive security model with multiple layers of protection:

- **Authentication**: JWT tokens and Shopify session verification
- **Authorization**: Shop scoping and role-based access
- **Rate Limiting**: Token bucket algorithm with Redis
- **Input Validation**: Zod schema validation
- **CSRF Protection**: Double-submit token pattern
- **PII Encryption**: AES-256-GCM encryption for sensitive data
- **Audit Logging**: Comprehensive security event logging

## Authentication Model

### JWT Token Authentication

#### Token Structure

```typescript
interface JWTClaims {
  sub: string;           // User ID
  shop: string;          // Shop domain
  iat: number;           // Issued at
  exp: number;           // Expires at
  scope: string[];       // Permissions
  iss: string;           // Issuer
}
```

#### Token Verification

```typescript
// Verify JWT token
const result = verifyJwtToken(token);

if (result.valid) {
  const { sub, shop, scope } = result.claims;
  // Token is valid, extract claims
} else {
  // Token is invalid, return 401
}
```

#### Token Renewal

JWT tokens have a 1-hour expiration. The frontend should:

1. **Monitor Token Expiry**: Check token expiration before API calls
2. **Automatic Renewal**: Renew tokens before expiration
3. **Handle Expired Tokens**: Redirect to login on token expiry

```typescript
// Check token expiry
const tokenExpiry = jwt.decode(token).exp * 1000;
const now = Date.now();
const timeUntilExpiry = tokenExpiry - now;

if (timeUntilExpiry < 300000) { // 5 minutes
  // Renew token
  const newToken = await renewToken();
}
```

### Shopify Session Authentication

#### Session Verification

```typescript
// Verify Shopify session
const session = await verifyShopifySession(sessionToken);

if (session.valid) {
  const { shop, user, expires } = session.data;
  // Session is valid
} else {
  // Session is invalid, return 401
}
```

#### Session Data

```typescript
interface ShopifySession {
  shop: string;           // Shop domain
  user: string;           // User email
  expires: number;        // Expiration timestamp
  scope: string[];        // Granted scopes
  access_token: string;   // Access token
}
```

## Authorization Model

### Shop Scoping

All authenticated endpoints require shop context:

#### Shop Resolution

```typescript
// Shop resolution order:
// 1. JWT token claims
// 2. X-Shop-Domain header
// 3. Query parameter

const shopDomain = req.auth?.shop || 
                   req.get('X-Shop-Domain') || 
                   req.query.shop;
```

#### Shop Validation

```typescript
// Validate shop is installed
const shop = await prisma.shop.findUnique({
  where: { domain: shopDomain }
});

if (!shop) {
  return res.status(409).json({
    error: 'shop_not_installed',
    message: 'Shop not installed. Please install the app first.'
  });
}
```

#### Shop Scoping Middleware

```typescript
// Shop scoping middleware
export function shopScopingMiddleware(req, res, next) {
  const shopDomain = resolveShop(req);
  
  if (!shopDomain) {
    return res.status(400).json({
      error: 'missing_shop_domain',
      message: 'Shop domain is required'
    });
  }
  
  // Attach shop context to request
  req.shop = { domain: shopDomain };
  next();
}
```

### Role-Based Access Control

#### Permission Scopes

| Scope | Description | Endpoints |
|-------|-------------|-----------|
| `read:campaigns` | View campaigns | `GET /campaigns` |
| `write:campaigns` | Create/edit campaigns | `POST /campaigns`, `PUT /campaigns/:id` |
| `read:reports` | View reports | `GET /reports/*` |
| `write:settings` | Modify settings | `PUT /settings` |
| `admin:metrics` | Access metrics | `GET /metrics` |

#### Scope Validation

```typescript
// Check required scopes
function requireScopes(requiredScopes: string[]) {
  return (req, res, next) => {
    const userScopes = req.auth?.scope || [];
    const hasRequiredScopes = requiredScopes.every(scope => 
      userScopes.includes(scope)
    );
    
    if (!hasRequiredScopes) {
      return res.status(403).json({
        error: 'insufficient_scope',
        message: 'Insufficient permissions',
        required: requiredScopes,
        granted: userScopes
      });
    }
    
    next();
  };
}
```

## Rate Limiting

### Token Bucket Algorithm

The rate limiting system uses a token bucket algorithm with Redis:

#### Rate Limit Configuration

| Endpoint Type | Burst Limit | Sustained Limit | Window |
|---------------|-------------|-----------------|--------|
| Admin API | 60 requests | 600 requests/minute | 1 minute |
| Public API | 10 requests | 100 requests/minute | 1 minute |
| Webhooks | 1000 requests | 10000 requests/minute | 1 minute |

#### Rate Limit Headers

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1640995200
Retry-After: 60
```

#### Rate Limit Implementation

```typescript
// Rate limiting middleware
export function rateLimitMiddleware(options = {}) {
  const {
    windowMs = 60000,        // 1 minute window
    maxRequests = 60,        // max requests per window
    burstLimit = 10,         // burst allowance
    keyGenerator = (req) => {
      const shopId = req.shop?.id || 'no-shop';
      const ip = req.ip || 'unknown';
      return `rate_limit:${shopId}:${ip}`;
    }
  } = options;
  
  return async (req, res, next) => {
    const key = keyGenerator(req);
    const redis = getRedisConnection();
    
    // Check rate limit
    const allowed = await checkRateLimit(redis, key, maxRequests, burstLimit);
    
    if (!allowed) {
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: 'Too many requests',
        retry_after: 60
      });
    }
    
    next();
  };
}
```

### Rate Limit Bypass

Certain endpoints bypass rate limiting:

- Health checks (`/health`, `/ready`)
- Metrics (`/metrics`) - when authenticated
- Queue health (`/queue/health`) - when authenticated

## Input Validation

### Zod Schema Validation

All input is validated using Zod schemas:

#### Request Validation

```typescript
// Campaign creation schema
const createCampaignSchema = z.object({
  name: z.string().min(1).max(100),
  template: z.string().min(1).max(1000),
  audience: z.object({
    segment: z.string().optional(),
    filter: z.object({}).optional()
  }),
  scheduled_at: z.string().datetime().optional()
});

// Validation middleware
export function validateRequest(schema: z.ZodSchema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'Invalid request data',
        details: error.errors
      });
    }
  };
}
```

#### Common Validation Schemas

```typescript
// Common schemas
export const commonSchemas = {
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/),
  email: z.string().email(),
  shopDomain: z.string().regex(/^[a-zA-Z0-9-]+\.myshopify\.com$/),
  dateRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime()
  })
};
```

### SQL Injection Prevention

All database queries use Prisma ORM with parameterized queries:

```typescript
// Safe query
const contacts = await prisma.contact.findMany({
  where: {
    shopId: shopId,
    phoneE164: phoneE164
  }
});

// Never use raw SQL with user input
// const query = `SELECT * FROM contacts WHERE phone = '${phone}'`; // DON'T DO THIS
```

## CSRF Protection

### Double-Submit Token Pattern

CSRF protection uses the double-submit token pattern:

#### Token Generation

```typescript
// Generate CSRF token
function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Set CSRF token in cookie
res.cookie('csrf-token', csrfToken, {
  httpOnly: false,
  secure: true,
  sameSite: 'strict'
});
```

#### Token Validation

```typescript
// CSRF middleware
export function csrfMiddleware(req, res, next) {
  const cookieToken = req.cookies['csrf-token'];
  const headerToken = req.get('X-CSRF-Token');
  
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      error: 'csrf_token_mismatch',
      message: 'CSRF token validation failed'
    });
  }
  
  next();
}
```

## PII Encryption

### AES-256-GCM Encryption

All sensitive data is encrypted using AES-256-GCM:

#### Encryption Implementation

```typescript
// Encrypt PII data
export function encryptPII(data: string, key: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipher('aes-256-gcm', key);
  cipher.setAAD(Buffer.from('sms-blossom'));
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

// Decrypt PII data
export function decryptPII(encryptedData: string, key: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipher('aes-256-gcm', key);
  decipher.setAAD(Buffer.from('sms-blossom'));
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

#### Encrypted Fields

| Field | Encryption | Purpose |
|-------|------------|---------|
| `phone_ciphertext` | AES-256-GCM | Customer phone numbers |
| `email_ciphertext` | AES-256-GCM | Customer email addresses |
| `customer_data` | AES-256-GCM | Additional customer data |

## Audit Logging

### Security Event Logging

All security-relevant events are logged:

#### Audit Log Schema

```typescript
interface AuditLog {
  id: string;
  shopId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}
```

#### Logged Events

| Event | Description | Data Logged |
|-------|-------------|-------------|
| `auth.login` | User login | User ID, IP, User Agent |
| `auth.logout` | User logout | User ID, IP |
| `auth.token_renewal` | Token renewal | User ID, IP |
| `campaign.create` | Campaign creation | Campaign ID, Name |
| `campaign.send` | Campaign sending | Campaign ID, Audience Size |
| `discount.create` | Discount creation | Discount ID, Code |
| `settings.update` | Settings change | Setting Name, Old Value, New Value |
| `pii.access` | PII data access | Data Type, Contact ID |
| `pii.export` | PII data export | Data Type, Contact ID |

#### Audit Log Implementation

```typescript
// Audit logging middleware
export function auditLoggingMiddleware(req, res, next) {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Log the request
    logger.info({
      action: req.method,
      resource: req.path,
      shopId: req.shop?.id,
      userId: req.auth?.sub,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode
    }, 'API request completed');
    
    originalSend.call(this, data);
  };
  
  next();
}
```

## Security Headers

### Security Headers Implementation

```typescript
// Security headers middleware
export function securityHeadersMiddleware(req, res, next) {
  // Prevent clickjacking
  res.set('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.set('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.set('X-XSS-Protection', '1; mode=block');
  
  // Strict Transport Security
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  // Content Security Policy
  res.set('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.shopify.com;"
  );
  
  next();
}
```

## Error Handling

### Security Error Responses

#### Authentication Errors

```typescript
// 401 Unauthorized
{
  "error": "unauthorized",
  "message": "Authentication required",
  "code": "AUTH_REQUIRED"
}

// 403 Forbidden
{
  "error": "forbidden",
  "message": "Insufficient permissions",
  "code": "INSUFFICIENT_SCOPE",
  "required": ["read:campaigns"],
  "granted": ["read:settings"]
}
```

#### Rate Limit Errors

```typescript
// 429 Too Many Requests
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "retry_after": 60,
  "limit": 60,
  "remaining": 0
}
```

#### Validation Errors

```typescript
// 400 Bad Request
{
  "error": "validation_error",
  "message": "Invalid request data",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "phone",
      "message": "Invalid phone number format",
      "code": "INVALID_PHONE"
    }
  ]
}
```

## Security Best Practices

### 1. Authentication

- **Use HTTPS**: All authentication must use HTTPS
- **Token Expiry**: JWT tokens expire after 1 hour
- **Secure Storage**: Store tokens securely in frontend
- **Automatic Renewal**: Renew tokens before expiration

### 2. Authorization

- **Principle of Least Privilege**: Grant minimum required permissions
- **Shop Scoping**: All operations are scoped to shop
- **Scope Validation**: Validate permissions for each request

### 3. Rate Limiting

- **Appropriate Limits**: Set limits based on endpoint usage
- **Burst Handling**: Allow short bursts of requests
- **User Feedback**: Provide clear rate limit information

### 4. Input Validation

- **Validate Everything**: Validate all input data
- **Use Schemas**: Use Zod schemas for validation
- **Sanitize Input**: Sanitize user input before processing

### 5. Data Protection

- **Encrypt PII**: Encrypt all sensitive data
- **Secure Keys**: Store encryption keys securely
- **Access Logging**: Log all PII access

## Security Monitoring

### Security Metrics

Monitor security-related metrics:

```typescript
// Security metrics
const securityMetrics = {
  auth_failures: 0,
  rate_limit_hits: 0,
  csrf_attempts: 0,
  validation_errors: 0,
  pii_access_count: 0
};
```

### Security Alerts

Set up alerts for:

- **High Auth Failures**: Multiple failed authentication attempts
- **Rate Limit Abuse**: Excessive rate limit hits
- **CSRF Attempts**: CSRF token validation failures
- **PII Access**: Unusual PII data access patterns

## Next Steps

1. Review [API Reference](./API_REFERENCE.md) for authentication requirements
2. Check [Frontend Integration Guide](./FRONTEND_INTEGRATION_GUIDE.md) for auth implementation
3. See [Templates Catalog](./TEMPLATES_CATALOG.md) for secure template usage
4. Use [TypeScript SDK](../sdk/index.ts) for type-safe authentication
