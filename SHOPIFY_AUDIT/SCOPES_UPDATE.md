# Shopify Scopes Update Required

## 🚨 **CRITICAL: Missing Scopes**

The current `SHOPIFY_SCOPES` configuration is missing required scopes for webhook management.

### Current Configuration
```bash
SHOPIFY_SCOPES=read_customers,write_customers,read_discounts,write_discounts,read_orders,read_inventory,read_checkouts
```

### Required Configuration
```bash
SHOPIFY_SCOPES=read_customers,write_customers,read_discounts,write_discounts,read_orders,read_inventory,read_checkouts,read_webhooks,write_webhooks
```

## 🔧 **IMMEDIATE ACTION REQUIRED**

1. **Update Environment Variables**:
   - Update `SHOPIFY_SCOPES` in all environments
   - Add `read_webhooks,write_webhooks` to the scope list

2. **Test Webhook Registration**:
   - Verify webhook registration works on app install
   - Check that all 15 webhook topics are registered

3. **Update Documentation**:
   - Update environment configuration docs
   - Update deployment guides

## 📋 **IMPACT ANALYSIS**

### Without These Scopes:
- ❌ Webhook registration will fail during app install
- ❌ Webhook management endpoints will return 403 Forbidden
- ❌ App cannot self-register required webhooks
- ❌ Real-time event processing will not work

### With These Scopes:
- ✅ All webhook topics can be registered
- ✅ Webhook management works properly
- ✅ Real-time event processing functions
- ✅ App installation completes successfully

## 🎯 **NEXT STEPS**

1. **Update Production Environment**:
   ```bash
   export SHOPIFY_SCOPES="read_customers,write_customers,read_discounts,write_discounts,read_orders,read_inventory,read_checkouts,read_webhooks,write_webhooks"
   ```

2. **Update Staging Environment**:
   ```bash
   export SHOPIFY_SCOPES="read_customers,write_customers,read_discounts,write_discounts,read_orders,read_inventory,read_checkouts,read_webhooks,write_webhooks"
   ```

3. **Update Development Environment**:
   ```bash
   export SHOPIFY_SCOPES="read_customers,write_customers,read_discounts,write_discounts,read_orders,read_inventory,read_checkouts,read_webhooks,write_webhooks"
   ```

4. **Test App Installation**:
   - Install app on test shop
   - Verify all webhooks are registered
   - Check webhook management endpoints work

## ⚠️ **WARNING**

This is a **CRITICAL** fix. Without these scopes, the app will fail to install properly and webhook functionality will be completely broken.
