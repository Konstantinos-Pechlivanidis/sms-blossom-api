import express from 'express';
import crypto from 'crypto';

/**
 * Mock Shopify API server for testing
 * Provides endpoints for OAuth, GraphQL, and webhook verification
 */
export class MockShopifyServer {
  constructor(port = 3001) {
    this.port = port;
    this.app = express();
    this.app.use(express.json());
    this.app.use(express.raw({ type: 'application/json' }));
    this.server = null;

    this.setupRoutes();
  }

  setupRoutes() {
    // OAuth endpoints
    this.app.get('/admin/oauth/authorize', (req, res) => {
      const { shop, client_id, redirect_uri, state } = req.query;

      if (!shop || !client_id || !redirect_uri) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      // Mock authorization page
      res.send(`
        <html>
          <body>
            <h1>Authorize App</h1>
            <p>Shop: ${shop}</p>
            <p>App: ${client_id}</p>
            <form method="post" action="/admin/oauth/authorize">
              <input type="hidden" name="shop" value="${shop}">
              <input type="hidden" name="client_id" value="${client_id}">
              <input type="hidden" name="redirect_uri" value="${redirect_uri}">
              <input type="hidden" name="state" value="${state || ''}">
              <button type="submit">Authorize</button>
            </form>
          </body>
        </html>
      `);
    });

    this.app.post('/admin/oauth/authorize', (req, res) => {
      const { shop, client_id: _client_id, redirect_uri, state } = req.body;

      // Mock successful authorization
      const code = 'mock_auth_code_' + Date.now();
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.set('code', code);
      redirectUrl.searchParams.set('state', state || '');
      redirectUrl.searchParams.set('shop', shop);

      res.redirect(redirectUrl.toString());
    });

    this.app.post('/admin/oauth/access_token', (req, res) => {
      const { client_id: _client_id, client_secret, code } = req.body;

      if (!_client_id || !client_secret || !code) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      // Mock access token response
      res.json({
        access_token: 'mock_access_token_' + Date.now(),
        scope: 'read_products,write_orders,read_customers',
      });
    });

    // GraphQL endpoint
    this.app.post('/admin/api/2023-10/graphql.json', (req, res) => {
      const { query, variables } = req.body;

      // Mock GraphQL responses based on query
      if (query.includes('discountCodeBasicCreate')) {
        res.json({
          data: {
            discountCodeBasicCreate: {
              codeDiscountNode: {
                id: 'gid://shopify/DiscountCodeNode/123456789',
                codeDiscount: {
                  id: 'gid://shopify/DiscountCodeBasic/123456789',
                  title: variables?.input?.title || 'Test Discount',
                  codes: {
                    edges: [
                      {
                        node: {
                          code: variables?.input?.code || 'TEST10',
                          id: 'gid://shopify/DiscountCode/123456789',
                        },
                      },
                    ],
                  },
                },
              },
              userErrors: [],
            },
          },
        });
      } else if (query.includes('discountCodeBasicUpdate')) {
        res.json({
          data: {
            discountCodeBasicUpdate: {
              codeDiscountNode: {
                id: 'gid://shopify/DiscountCodeNode/123456789',
                codeDiscount: {
                  id: 'gid://shopify/DiscountCodeBasic/123456789',
                  title: variables?.input?.title || 'Updated Discount',
                },
              },
              userErrors: [],
            },
          },
        });
      } else {
        res.json({ data: {} });
      }
    });

    // Webhook verification endpoint
    this.app.post('/webhooks/verify', (req, res) => {
      const hmac = req.headers['x-shopify-hmac-sha256'];
      const body = req.body;

      if (!hmac) {
        return res.status(401).json({ error: 'Missing HMAC' });
      }

      // Mock HMAC verification
      const calculatedHmac = crypto
        .createHmac('sha256', 'mock_webhook_secret')
        .update(body)
        .digest('base64');

      if (hmac !== calculatedHmac) {
        return res.status(401).json({ error: 'Invalid HMAC' });
      }

      res.json({ verified: true });
    });

    // Shop info endpoint
    this.app.get('/admin/api/2023-10/shop.json', (req, res) => {
      res.json({
        shop: {
          id: 123456789,
          name: 'Test Shop',
          domain: 'test-shop.myshopify.com',
          email: 'test@example.com',
          currency: 'USD',
          timezone: 'America/New_York',
          locale: 'en',
        },
      });
    });

    // Customer consent update
    this.app.put('/admin/api/2023-10/customers/:id.json', (req, res) => {
      const { id } = req.params;
      const { customer } = req.body;

      res.json({
        customer: {
          id: parseInt(id),
          email: customer.email,
          accepts_marketing: customer.accepts_marketing || false,
          accepts_marketing_updated_at: new Date().toISOString(),
        },
      });
    });
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Mock Shopify server running on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Mock Shopify server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getBaseUrl() {
    return `http://localhost:${this.port}`;
  }
}
