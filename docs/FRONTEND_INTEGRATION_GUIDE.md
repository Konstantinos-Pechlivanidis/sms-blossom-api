# Frontend Integration Guide

This guide provides step-by-step instructions for integrating the SMS Blossom backend with your Shopify embedded app frontend.

## Prerequisites

- Shopify embedded app with App Bridge
- React/Next.js frontend (recommended)
- TypeScript support (recommended)

## 1. Authentication Setup

### Obtaining Session Token

```typescript
import { useAppBridge } from '@shopify/app-bridge-react';
import { getSessionToken } from '@shopify/app-bridge/utilities';

function useApiClient() {
  const app = useAppBridge();

  const getAuthHeaders = async () => {
    const token = await getSessionToken(app);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  return { getAuthHeaders };
}
```

### Shop Domain Header

```typescript
// Extract shop domain from URL or App Bridge
const shopDomain = window.location.hostname.replace('.myshopify.com', '') + '.myshopify.com';

const headers = {
  Authorization: `Bearer ${token}`,
  'X-Shop-Domain': shopDomain,
  'Content-Type': 'application/json',
};
```

## 2. API Client Setup

### Basic Fetch Wrapper

```typescript
class ApiClient {
  private baseUrl: string;
  private getAuthHeaders: () => Promise<Record<string, string>>;

  constructor(baseUrl: string, getAuthHeaders: () => Promise<Record<string, string>>) {
    this.baseUrl = baseUrl;
    this.getAuthHeaders = getAuthHeaders;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = await this.getAuthHeaders();

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    return response.json();
  }

  // GET request
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  // POST request
  async post<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // PUT request
  async put<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // DELETE request
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}
```

### Error Handling

```typescript
class ApiError extends Error {
  constructor(
    public status: number,
    public response: string,
  ) {
    super(`API Error ${status}: ${response}`);
  }
}

// Error handler for UI
function handleApiError(error: ApiError): string {
  switch (error.status) {
    case 401:
      return 'Please log in again';
    case 403:
      return 'You do not have permission to perform this action';
    case 409:
      return 'Shop not installed. Please install the app first';
    case 429:
      return 'Too many requests. Please wait a moment';
    case 500:
      return 'Server error. Please try again later';
    default:
      return 'An unexpected error occurred';
  }
}
```

## 3. CORS Configuration

### Required Origins

The backend CORS allowlist includes:

- `https://admin.shopify.com` (Shopify Admin)
- `https://your-app-domain.com` (Your app domain)

### Frontend CORS Headers

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://admin.shopify.com',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, X-Shop-Domain, Content-Type',
  'Access-Control-Allow-Credentials': 'true',
};
```

## 4. Retry and Backoff Patterns

### Exponential Backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      // Don't retry on client errors (4xx)
      if (error instanceof ApiError && error.status < 500) {
        throw error;
      }

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
```

### Rate Limit Handling

```typescript
async function handleRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      // Extract Retry-After header
      const retryAfter = error.response.match(/Retry-After: (\d+)/)?.[1];
      if (retryAfter) {
        await new Promise((resolve) => setTimeout(resolve, parseInt(retryAfter) * 1000));
        return fn(); // Retry once
      }
    }
    throw error;
  }
}
```

## 5. Error Taxonomy Mapping

### HTTP Status Codes → UI Actions

| Status | UI Action                | User Message                     |
| ------ | ------------------------ | -------------------------------- |
| 401    | Redirect to login        | "Please log in again"            |
| 403    | Show error banner        | "You don't have permission"      |
| 409    | Show installation prompt | "Please install the app first"   |
| 429    | Show retry button        | "Too many requests. Please wait" |
| 500    | Show error banner        | "Server error. Please try again" |

### Error Banner Component

```typescript
interface ErrorBannerProps {
  error: ApiError;
  onRetry?: () => void;
  onDismiss?: () => void;
}

function ErrorBanner({ error, onRetry, onDismiss }: ErrorBannerProps) {
  const message = handleApiError(error);
  const canRetry = error.status >= 500 || error.status === 429;

  return (
    <div className="error-banner">
      <span>{message}</span>
      {canRetry && onRetry && (
        <button onClick={onRetry}>Retry</button>
      )}
      {onDismiss && (
        <button onClick={onDismiss}>Dismiss</button>
      )}
    </div>
  );
}
```

## 6. Request ID Tracking

### Adding Request IDs

```typescript
function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Add to all requests
const headers = {
  ...authHeaders,
  'X-Request-ID': generateRequestId(),
};
```

### Logging Integration

```typescript
function logApiCall(endpoint: string, method: string, requestId: string) {
  console.log(`API Call: ${method} ${endpoint}`, { requestId });
}

function logApiError(error: ApiError, requestId: string) {
  console.error(`API Error: ${error.status}`, {
    requestId,
    endpoint: error.endpoint,
    response: error.response,
  });
}
```

## 7. TypeScript SDK Usage

### Using the Generated SDK

```typescript
import { SmsBlossomApi } from '../sdk';

// Initialize client
const api = new SmsBlossomApi({
  baseUrl: process.env.REACT_APP_API_URL,
  getAuthHeaders: async () => {
    const token = await getSessionToken(app);
    return {
      Authorization: `Bearer ${token}`,
      'X-Shop-Domain': shopDomain,
    };
  },
});

// Type-safe API calls
const health = await api.health.get();
const campaigns = await api.campaigns.list();
const newCampaign = await api.campaigns.create({
  name: 'Welcome Campaign',
  template: 'Welcome {{customer_name}}!',
  audience: { segment: 'all' },
});
```

## 8. Environment Configuration

### Frontend Environment Variables

```bash
# .env.local
REACT_APP_API_URL=https://api.sms-blossom.com
REACT_APP_SHOPIFY_API_KEY=your-shopify-key
REACT_APP_PROXY_URL=https://api.sms-blossom.com/proxy
REACT_APP_PROXY_SUBPATH=/apps/sms-blossom
```

### Environment-Specific Configuration

```typescript
const config = {
  development: {
    apiUrl: 'http://localhost:3001',
    proxyUrl: 'http://localhost:3001/proxy',
  },
  production: {
    apiUrl: process.env.REACT_APP_API_URL,
    proxyUrl: process.env.REACT_APP_PROXY_URL,
  },
};

const environment = process.env.NODE_ENV || 'development';
export const apiConfig = config[environment];
```

## 9. Testing Integration

### Mock API Client

```typescript
class MockApiClient extends ApiClient {
  constructor() {
    super('', async () => ({}));
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // Mock implementation
    return {} as T;
  }
}
```

### Test Setup

```typescript
import { renderHook } from '@testing-library/react';
import { useApiClient } from './useApiClient';

test('should handle API errors', async () => {
  const { result } = renderHook(() => useApiClient());

  try {
    await result.current.get('/invalid-endpoint');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
  }
});
```

## 10. Best Practices

### 1. Always Handle Errors

```typescript
try {
  const data = await api.campaigns.list();
  setCampaigns(data);
} catch (error) {
  setError(handleApiError(error));
}
```

### 2. Use Loading States

```typescript
const [loading, setLoading] = useState(false);
const [data, setData] = useState(null);

const fetchData = async () => {
  setLoading(true);
  try {
    const result = await api.campaigns.list();
    setData(result);
  } finally {
    setLoading(false);
  }
};
```

### 3. Implement Caching

```typescript
const cache = new Map();

async function getCachedData<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const data = await fetcher();
  cache.set(key, data);
  return data;
}
```

### 4. Use Request Deduplication

```typescript
const pendingRequests = new Map();

async function deduplicatedRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const promise = fetcher();
  pendingRequests.set(key, promise);

  try {
    const result = await promise;
    return result;
  } finally {
    pendingRequests.delete(key);
  }
}
```

## Next Steps

1. Review the [API Reference](./API_REFERENCE.md) for endpoint details
2. Check the [TypeScript SDK](../sdk/index.ts) for type-safe API calls
3. See [Security Surface](./SECURITY_SURFACE.md) for authentication requirements
4. Use [Feature Checklist](./FRONTEND_FEATURE_CHECKLIST.md) for implementation guidance
