# Required Shopify Scopes Analysis

## Current Configuration

**Configured Scopes**: `read_customers,write_customers,read_discounts,write_discounts,read_orders,read_inventory,read_checkouts`

## Required Scopes by Operation

### ✅ **SCOPE COVERAGE ANALYSIS**

| Operation | Required Scope | Current | Status |
|-----------|----------------|---------|---------|
| **Customer Operations** | | | |
| `customers/create` webhook | `read_customers` | ✅ | ✅ |
| `customers/update` webhook | `read_customers` | ✅ | ✅ |
| `customers/marketing_consent_update` webhook | `write_customers` | ✅ | ✅ |
| `customerSmsMarketingConsentUpdate` GraphQL | `write_customers` | ✅ | ✅ |
| Bulk customer sync | `read_customers` | ✅ | ✅ |
| **Order Operations** | | | |
| `orders/create` webhook | `read_orders` | ✅ | ✅ |
| `orders/paid` webhook | `read_orders` | ✅ | ✅ |
| `orders/fulfilled` webhook | `read_orders` | ✅ | ✅ |
| **Fulfillment Operations** | | | |
| `fulfillments/create` webhook | `read_orders` | ✅ | ✅ |
| `fulfillments/update` webhook | `read_orders` | ✅ | ✅ |
| **Checkout Operations** | | | |
| `checkouts/create` webhook | `read_checkouts` | ✅ | ✅ |
| `checkouts/update` webhook | `read_checkouts` | ✅ | ✅ |
| **Inventory Operations** | | | |
| `inventory_levels/update` webhook | `read_inventory` | ✅ | ✅ |
| **Discount Operations** | | | |
| `discountCodeBasicCreate` GraphQL | `write_discounts` | ✅ | ✅ |
| `discountCodeBasicUpdate` GraphQL | `write_discounts` | ✅ | ✅ |
| `fetchExistingDiscounts` GraphQL | `read_discounts` | ✅ | ✅ |
| **Webhook Management** | | | |
| `webhookSubscriptionCreate` GraphQL | `write_webhooks` | ❌ | ❌ **MISSING** |
| `webhookSubscriptionUpdate` GraphQL | `write_webhooks` | ❌ | ❌ **MISSING** |
| `webhookSubscriptions` GraphQL | `read_webhooks` | ❌ | ❌ **MISSING** |

## ❌ **MISSING SCOPES**

### Critical Missing Scopes

1. **`write_webhooks`** - Required for webhook subscription management
2. **`read_webhooks`** - Required for listing webhook subscriptions

### Impact

- **Webhook registration will fail** during app install/upgrade
- **Webhook management endpoints will return 403 Forbidden**
- **App cannot self-register required webhooks**

## 🔧 **RECOMMENDED FIX**

Update `SHOPIFY_SCOPES` environment variable:

```bash
# Current
SHOPIFY_SCOPES=read_customers,write_customers,read_discounts,write_discounts,read_orders,read_inventory,read_checkouts

# Required
SHOPIFY_SCOPES=read_customers,write_customers,read_discounts,write_discounts,read_orders,read_inventory,read_checkouts,read_webhooks,write_webhooks
```

## 📋 **SCOPE VALIDATION CHECKLIST**

- [ ] Add `read_webhooks` scope
- [ ] Add `write_webhooks` scope  
- [ ] Update environment configuration
- [ ] Test webhook registration on app install
- [ ] Verify webhook management endpoints work
- [ ] Update documentation with new scopes

## 🚨 **IMMEDIATE ACTION REQUIRED**

The missing webhook scopes will cause **app installation failures** and **webhook registration errors**. This must be fixed before production deployment.
