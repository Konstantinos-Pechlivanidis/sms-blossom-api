// src/lib/shopify/shopifyClient.js
// Centralized Shopify API client with rate limiting and cost-aware throttling

import { getPrismaClient } from '../../db/prismaClient.js';
import { decryptFromString } from '../crypto.js';
import { logger } from '../logger.js';

const prisma = getPrismaClient();

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

  // @cursor:start(rest-rate-limiting)
  async rest(endpoint, options = {}) {
    await this.checkRateLimit('rest');
    
    const response = await this.makeRequest(`/admin/api/2025-10/${endpoint}`, {
      method: 'GET',
      ...options
    });
    
    return response.data;
  }
  // @cursor:end(rest-rate-limiting)

  // @cursor:start(bulk-operations)
  async bulkOperation(query) {
    await this.checkRateLimit('bulk');
    
    const response = await this.makeRequest('/admin/api/2025-10/graphql.json', {
      method: 'POST',
      body: JSON.stringify({
        query: `
          mutation {
            bulkOperationRunQuery(query: "${query}") {
              bulkOperation { id }
              userErrors { field message }
            }
          }
        `
      })
    });
    
    return response.data.bulkOperationRunQuery;
  }
  // @cursor:end(bulk-operations)

  // @cursor:start(rate-limit-check)
  async checkRateLimit(type, cost = 1) {
    const limit = RATE_LIMITS[type];
    if (!limit) return;

    const key = `shopify_rate_limit:${this.shopDomain}:${type}`;
    const now = Date.now();
    const windowStart = Math.floor(now / limit.window) * limit.window;
    const windowKey = `${key}:${windowStart}`;

    // Get current usage
    const currentUsage = await this.getCurrentUsage(windowKey);
    
    if (currentUsage + cost > limit.points) {
      const retryAfter = Math.ceil((windowStart + limit.window - now) / 1000);
      
      logger.warn({
        shopDomain: this.shopDomain,
        type,
        currentUsage,
        cost,
        limit: limit.points,
        retryAfter
      }, 'Shopify API rate limit exceeded');
      
      throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    }

    // Update usage
    await this.updateUsage(windowKey, cost, limit.window);
  }

  async getCurrentUsage(key) {
    // Implementation would use Redis or in-memory store
    // For now, return 0 to allow requests
    return 0;
  }

  async updateUsage(key, cost, ttl) {
    // Implementation would update Redis or in-memory store
  }
  // @cursor:end(rate-limit-check)

  // @cursor:start(make-request)
  async makeRequest(path, options = {}) {
    const url = `https://${this.shopDomain}${path}`;
    
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': this.accessToken,
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      const error = new Error(`Shopify API error: ${response.statusText}`);
      error.status = response.status;
      error.response = await response.text();
      throw error;
    }

    const data = await response.json();
    
    if (data.errors) {
      const error = new Error('Shopify GraphQL errors');
      error.details = data.errors;
      throw error;
    }

    return { data: data.data, headers: response.headers };
  }
  // @cursor:end(make-request)
}

// @cursor:start(get-client)
export async function getShopifyClient(shopDomain) {
  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain }
  });

  if (!shop || !shop.tokenOffline) {
    throw new Error(`Shop not found or no access token: ${shopDomain}`);
  }

  const accessToken = decryptFromString(shop.tokenOffline);
  return new ShopifyClient(shopDomain, accessToken);
}
// @cursor:end(get-client)
