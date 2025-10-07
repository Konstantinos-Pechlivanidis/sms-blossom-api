// checks/mock-shopify.js
// Mock Shopify Admin GraphQL API for testing

import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.MOCK_SHOPIFY_PORT || 3002;

app.use(cors());
app.use(express.json());

// Mock discount creation
app.post('/admin/api/2024-01/graphql.json', (req, res) => {
  const { query, variables } = req.body;
  
  if (query.includes('codeDiscountNodeCreate')) {
    const discountId = `gid://shopify/DiscountCodeNode/${Date.now()}`;
    
    res.json({
      data: {
        codeDiscountNodeCreate: {
          codeDiscountNode: {
            id: discountId,
            codeDiscount: {
              id: discountId,
              title: variables.input.title || 'Test Discount',
              codes: {
                nodes: [{
                  id: `gid://shopify/DiscountCode/${Date.now()}`,
                  code: variables.input.codes[0] || 'TEST10'
                }]
              }
            }
          },
          userErrors: []
        }
      }
    });
  } else if (query.includes('customerSmsMarketingConsentUpdate')) {
    res.json({
      data: {
        customerSmsMarketingConsentUpdate: {
          customer: {
            id: variables.input.customerId,
            smsMarketingConsent: {
              marketingState: variables.input.consent.marketingState,
              marketingOptInLevel: variables.input.consent.marketingOptInLevel,
              consentUpdatedAt: new Date().toISOString()
            }
          },
          userErrors: []
        }
      }
    });
  } else {
    res.json({ data: {}, userErrors: [] });
  }
});

// Mock customer search
app.post('/admin/api/2024-01/customers/search.json', (req, res) => {
  const { query } = req.body;
  
  if (query.includes('phone')) {
    res.json({
      customers: [{
        id: 123456789,
        email: 'test@example.com',
        phone: '+306912345678',
        first_name: 'Test',
        last_name: 'User'
      }]
    });
  } else {
    res.json({ customers: [] });
  }
});

// Mock webhook verification
app.use((req, res, next) => {
  // Simulate Shopify HMAC verification
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  if (hmac) {
    req.verified = true;
  }
  next();
});

// Mock webhook endpoints
app.post('/webhooks/orders/paid', (req, res) => {
  res.json({ received: true });
});

app.post('/webhooks/checkouts/update', (req, res) => {
  res.json({ received: true });
});

app.post('/webhooks/inventory_levels/update', (req, res) => {
  res.json({ received: true });
});

app.listen(PORT, () => {
  console.log(`Mock Shopify API running on http://localhost:${PORT}`);
});

export default app;
