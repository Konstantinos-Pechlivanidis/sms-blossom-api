# Templates Catalog

This document provides a comprehensive catalog of available template variables, Liquid filters, and SMS segmentation rules for the SMS Blossom template system.

## Template System Overview

The SMS Blossom template system uses LiquidJS with custom filters and strict variable validation. Templates support SMS segmentation warnings and Unicode detection.

### Template Engine Features

- **LiquidJS**: Full Liquid template support
- **Strict Variables**: Unknown variables trigger warnings
- **SMS Segmentation**: Automatic character counting and part detection
- **Unicode Detection**: Warns about Unicode characters that may affect delivery
- **Custom Filters**: Money, date, shortlink, and text formatting filters

## Trigger Variables

### Abandoned Checkout

**Trigger**: `abandoned_checkout`  
**Description**: Sent when a customer abandons their checkout

**Required Variables**:
- `recovery_url`: Link to complete checkout
- `checkout_id`: Unique checkout identifier

**Optional Variables**:
- `customer_name`: Customer's full name
- `cart_total`: Total cart value
- `currency`: Currency code (e.g., "USD")
- `shop_name`: Store name

**Example Template**:
```liquid
Hi {{customer_name | default: "there"}}! 

You left items in your cart worth {{cart_total | money: currency}}. Complete your purchase: {{recovery_url | shortlink}}

{{shop_name}}
```

### Order Created

**Trigger**: `order_created`  
**Description**: Sent when a new order is created

**Required Variables**:
- `order_number`: Order number
- `order_total`: Order total amount

**Optional Variables**:
- `customer_name`: Customer's full name
- `currency`: Currency code
- `shop_name`: Store name
- `order_url`: Link to order details

**Example Template**:
```liquid
Thank you for your order #{{order_number}}!

Order total: {{order_total | money: currency}}
View order: {{order_url | shortlink}}

{{shop_name}}
```

### Order Paid

**Trigger**: `order_paid`  
**Description**: Sent when an order payment is completed

**Required Variables**:
- `order_number`: Order number
- `order_total`: Order total amount

**Optional Variables**:
- `customer_name`: Customer's full name
- `currency`: Currency code
- `shop_name`: Store name
- `order_url`: Link to order details
- `tracking_number`: Tracking number (if available)

**Example Template**:
```liquid
Payment confirmed for order #{{order_number}}!

Total: {{order_total | money: currency}}
{% if tracking_number %}Tracking: {{tracking_number}}{% endif %}

{{shop_name}}
```

### Fulfillment Update

**Trigger**: `fulfillment_update`  
**Description**: Sent when order fulfillment is updated

**Required Variables**:
- `order_number`: Order number
- `tracking_number`: Tracking number

**Optional Variables**:
- `customer_name`: Customer's full name
- `carrier`: Shipping carrier
- `tracking_url`: Tracking URL
- `shop_name`: Store name

**Example Template**:
```liquid
Your order #{{order_number}} has shipped!

Tracking: {{tracking_number}}
{% if tracking_url %}Track: {{tracking_url | shortlink}}{% endif %}
{% if carrier %}Carrier: {{carrier | titlecase}}{% endif %}

{{shop_name}}
```

### Welcome

**Trigger**: `welcome`  
**Description**: Sent to new customers

**Required Variables**:
- `customer_name`: Customer's full name

**Optional Variables**:
- `shop_name`: Store name
- `discount_code`: Welcome discount code
- `discount_value`: Discount value

**Example Template**:
```liquid
Welcome to {{shop_name}}, {{customer_name}}!

{% if discount_code %}Use code {{discount_code}} for {{discount_value | money}} off your first order!{% endif %}

Thanks for joining us!
```

### Back in Stock

**Trigger**: `back_in_stock`  
**Description**: Sent when a product is back in stock

**Required Variables**:
- `product_name`: Product name
- `product_url`: Product URL

**Optional Variables**:
- `customer_name`: Customer's full name
- `shop_name`: Store name
- `inventory_count`: Available quantity

**Example Template**:
```liquid
{{product_name}} is back in stock!

{% if inventory_count %}Only {{inventory_count}} left!{% endif %}
Shop now: {{product_url | shortlink}}

{{shop_name}}
```

## Liquid Filters

### Money Filter

**Usage**: `{{value | money: currency, locale}}`

**Parameters**:
- `value`: Number or string to format
- `currency`: Currency code (default: "USD")
- `locale`: Locale for formatting (default: "en-US")

**Examples**:
```liquid
{{order_total | money}}                    <!-- $99.99 -->
{{order_total | money: "EUR"}}             <!-- €99.99 -->
{{order_total | money: "USD", "en-GB"}}    <!-- US$99.99 -->
```

### Date Filter

**Usage**: `{{date | date: format, timezone, locale}}`

**Parameters**:
- `date`: Date string or Date object
- `format`: Date format (default: "short")
- `timezone`: Timezone (default: "UTC")
- `locale`: Locale for formatting (default: "en-US")

**Formats**:
- `short`: 1/15/2024
- `long`: January 15, 2024
- `time`: 10:30 AM
- `datetime`: 1/15/2024, 10:30 AM

**Examples**:
```liquid
{{order_date | date}}                      <!-- 1/15/2024 -->
{{order_date | date: "long"}}              <!-- January 15, 2024 -->
{{order_date | date: "time", "America/New_York"}}  <!-- 5:30 AM -->
```

### Shortlink Filter

**Usage**: `{{url | shortlink}}`

**Description**: Creates shortened URLs for SMS

**Examples**:
```liquid
{{product_url | shortlink}}                <!-- https://short.ly/abc123 -->
{{recovery_url | shortlink}}               <!-- https://short.ly/def456 -->
```

### Default Filter

**Usage**: `{{value | default: fallback}}`

**Description**: Provides fallback value for null/undefined variables

**Examples**:
```liquid
{{customer_name | default: "Valued Customer"}}
{{discount_code | default: "SAVE10"}}
{{shop_name | default: "Our Store"}}
```

### Text Filters

#### Titlecase Filter
**Usage**: `{{text | titlecase}}`
**Description**: Converts text to title case

#### Upper Filter
**Usage**: `{{text | upper}}`
**Description**: Converts text to uppercase

#### Lower Filter
**Usage**: `{{text | lower}}`
**Description**: Converts text to lowercase

#### Truncate Filter
**Usage**: `{{text | truncate: length, suffix}}`
**Description**: Truncates text to specified length

**Examples**:
```liquid
{{product_name | titlecase}}               <!-- "Amazing Product" -->
{{discount_code | upper}}                  <!-- "SAVE10" -->
{{long_description | truncate: 50}}        <!-- "This is a long description that..." -->
{{long_description | truncate: 50, "..."}} <!-- "This is a long description..." -->
```

## SMS Segmentation

### Character Limits

- **Single SMS**: 160 characters (GSM 7-bit)
- **Unicode SMS**: 70 characters (UTF-8)
- **Multi-part SMS**: 153 characters per part (GSM 7-bit)

### Segmentation Warnings

The template system automatically detects and warns about:

1. **Multi-part SMS**: When message exceeds 160 characters
2. **Unicode Characters**: When message contains non-GSM characters
3. **Unknown Variables**: When template contains undefined variables

### Example Warnings

```json
{
  "warnings": [
    "SMS will be split into 2 parts (280 characters)",
    "Unicode characters detected - may affect delivery rates",
    "Unknown variables detected: invalid_var"
  ]
}
```

## Template Validation

### Required Variables Check

Templates are validated against trigger-specific variable requirements:

```typescript
interface TemplateValidation {
  valid: boolean;
  warnings: string[];
  variables_used: string[];
  missing_required: string[];
  unknown_variables: string[];
}
```

### Example Validation Response

```json
{
  "valid": true,
  "warnings": [
    "SMS will be split into 2 parts (280 characters)"
  ],
  "variables_used": ["customer_name", "order_total", "currency"],
  "missing_required": [],
  "unknown_variables": []
}
```

## Template Examples

### Abandoned Checkout Recovery

```liquid
Hi {{customer_name | default: "there"}}! 

You left items worth {{cart_total | money: currency}} in your cart. Complete your purchase: {{recovery_url | shortlink}}

{{shop_name}}
```

### Order Confirmation

```liquid
Thank you for your order #{{order_number}}!

Total: {{order_total | money: currency}}
{% if tracking_number %}Tracking: {{tracking_number}}{% endif %}

{{shop_name}}
```

### Welcome Message

```liquid
Welcome to {{shop_name}}, {{customer_name}}!

{% if discount_code %}Use code {{discount_code}} for {{discount_value | money}} off!{% endif %}

Thanks for joining us!
```

### Shipping Update

```liquid
Your order #{{order_number}} has shipped!

Tracking: {{tracking_number}}
{% if tracking_url %}Track: {{tracking_url | shortlink}}{% endif %}

{{shop_name}}
```

### Back in Stock Alert

```liquid
{{product_name}} is back in stock!

{% if inventory_count %}Only {{inventory_count}} left!{% endif %}
Shop now: {{product_url | shortlink}}

{{shop_name}}
```

## Best Practices

### 1. Keep Messages Concise

- Aim for single SMS (160 characters)
- Use shortlinks for URLs
- Avoid unnecessary words

### 2. Use Default Values

```liquid
{{customer_name | default: "Valued Customer"}}
{{shop_name | default: "Our Store"}}
```

### 3. Handle Missing Data

```liquid
{% if tracking_number %}Tracking: {{tracking_number}}{% endif %}
{% if discount_code %}Use code {{discount_code}}{% endif %}
```

### 4. Format Currency Properly

```liquid
{{order_total | money: currency}}
{{discount_value | money: "USD"}}
```

### 5. Use Appropriate Filters

```liquid
{{product_name | titlecase}}
{{discount_code | upper}}
{{long_text | truncate: 50}}
```

## Template API Usage

### Preview Template

```typescript
const result = await api.templates.preview({
  template: "Hello {{customer_name}}!",
  variables: {
    customer_name: "John Doe"
  }
});

console.log(result.rendered); // "Hello John Doe!"
console.log(result.warnings); // []
```

### Validate Template

```typescript
const validation = await api.templates.validate({
  template: "Hello {{customer_name}}!",
  trigger: "welcome"
});

console.log(validation.valid); // true
console.log(validation.variables_used); // ["customer_name"]
```

### Get Variables

```typescript
const variables = await api.templates.getVariables("abandoned_checkout");

console.log(variables.required); // ["recovery_url", "checkout_id"]
console.log(variables.optional); // ["customer_name", "cart_total"]
```

## Testing Templates

### Local Testing

```bash
# Test template rendering
curl -X POST https://api.sms-blossom.com/templates/preview \
  -H "Authorization: Bearer <token>" \
  -H "X-Shop-Domain: shop.myshopify.com" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "Hello {{customer_name}}!",
    "variables": {"customer_name": "John"}
  }'
```

### Validation Testing

```bash
# Test template validation
curl -X POST https://api.sms-blossom.com/templates/validate \
  -H "Authorization: Bearer <token>" \
  -H "X-Shop-Domain: shop.myshopify.com" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "Hello {{customer_name}}!",
    "trigger": "welcome"
  }'
```

## Next Steps

1. Review [API Reference](./API_REFERENCE.md) for template endpoint details
2. Check [Webhooks Guide](./WEBHOOKS_AND_EVENTS.md) for trigger context
3. See [Campaigns Guide](./CAMPAIGNS_AND_DISCOUNTS_GUIDE.md) for template usage
4. Use [TypeScript SDK](../sdk/index.ts) for type-safe template operations
