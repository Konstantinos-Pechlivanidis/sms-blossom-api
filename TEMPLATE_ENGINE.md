# Template Engine Documentation

## Overview

The SMS Blossom template engine provides Liquid template rendering with custom filters, validation, and SMS segmentation analysis. It supports strict mode validation and provides warnings for multi-part SMS and Unicode characters.

## Usage

### Basic Template Rendering

```javascript
import { renderTemplate } from '../services/templates.js';

const result = await renderTemplate({
  body: 'Hello {{ customer_name }}, your order {{ order_number }} is ready!',
  vars: {
    customer_name: 'John Doe',
    order_number: '#1001',
  },
  locale: 'en-US',
});

console.log(result.text); // "Hello John Doe, your order #1001 is ready!"
console.log(result.warnings); // []
```

### Template Validation

```javascript
import { validateTemplate } from '../services/templates.js';

const result = validateTemplate({
  body: 'Hello {{ customer_name }}, your order {{ order_number }} is ready!',
  trigger: 'order_created',
});

console.log(result.ok); // true/false
console.log(result.errors); // ['Missing required variables: ...']
console.log(result.warnings); // ['Unknown variables: ...']
```

### List Available Variables

```javascript
import { listVariables } from '../services/templates.js';

const variables = listVariables('abandoned_checkout');
// ['recovery_url', 'checkout_id', 'customer_name', 'cart_total', ...]
```

## Custom Filters

### Money Filter

Format currency values with locale support.

```liquid
{{ order_total | money "USD" "en-US" }}
{{ order_total | money "EUR" "de-DE" }}
```

**Parameters:**

- `currency` (string): Currency code (default: USD)
- `locale` (string): Locale for formatting (default: en-US)

### Date Filter

Format dates with timezone awareness.

```liquid
{{ order_date | date "short" "America/New_York" "en-US" }}
{{ order_date | date "long" "UTC" "en-US" }}
```

**Parameters:**

- `format` (string): Date format - short, long, time, datetime, iso (default: short)
- `timezone` (string): Timezone (default: UTC)
- `locale` (string): Locale for formatting (default: en-US)

### Shortlink Filter

Create short URLs with campaign tracking.

```liquid
{{ product_url | shortlink "campaign123" }}
{{ tracking_url | shortlink }}
```

**Parameters:**

- `campaignId` (string): Campaign ID for UTM tracking (optional)

### Default Filter

Provide default values for missing variables.

```liquid
{{ customer_name | default "Customer" }}
{{ order_number | default "N/A" }}
```

### Text Filters

#### Titlecase

```liquid
{{ customer_name | titlecase }}
```

#### Truncate

```liquid
{{ long_text | truncate 50 "..." }}
```

#### Upper/Lower

```liquid
{{ text | upper }}
{{ text | lower }}
```

## Trigger Variables

### Abandoned Checkout

**Required:** `recovery_url`, `checkout_id`
**Optional:** `customer_name`, `cart_total`, `currency`, `shop_name`

```liquid
Hi {{ customer_name | default "Customer" }}! Complete your order: {{ recovery_url }}
```

### Order Created

**Required:** `order_number`, `order_total`
**Optional:** `customer_name`, `currency`, `shop_name`, `order_url`

```liquid
Order {{ order_number }} confirmed! Total: {{ order_total | money currency }}
```

### Order Paid

**Required:** `order_number`, `order_total`
**Optional:** `customer_name`, `currency`, `shop_name`, `order_url`, `tracking_number`

```liquid
Payment received for order {{ order_number }}! Tracking: {{ tracking_number }}
```

### Fulfillment Update

**Required:** `order_number`, `tracking_number`
**Optional:** `customer_name`, `carrier`, `tracking_url`, `shop_name`

```liquid
Order {{ order_number }} shipped! Track: {{ tracking_url | shortlink }}
```

### Welcome

**Required:** `customer_name`
**Optional:** `shop_name`, `discount_code`, `discount_value`

```liquid
Welcome {{ customer_name | titlecase }}! Use code {{ discount_code }} for {{ discount_value }}% off!
```

### Back in Stock

**Required:** `product_name`, `product_url`
**Optional:** `customer_name`, `shop_name`, `inventory_count`

```liquid
{{ product_name }} is back in stock! Shop now: {{ product_url | shortlink }}
```

## SMS Segmentation

The template engine automatically analyzes SMS segmentation and provides warnings:

### GSM 7-bit (Standard)

- Single segment: ≤160 characters
- Multi-segment: 161-306 characters (2 parts), 307-459 characters (3 parts), etc.

### Unicode (Extended)

- Single segment: ≤70 characters
- Multi-segment: 71-134 characters (2 parts), 135-201 characters (3 parts), etc.

### Warnings

- **Multi-part SMS:** "SMS will be split into X parts (Y characters)"
- **Unicode detected:** "Unicode characters may affect delivery rates"

## API Endpoints

### Preview Template

```http
POST /templates/preview
Content-Type: application/json

{
  "trigger": "abandoned_checkout",
  "body": "Hi {{ customer_name }}! Complete your order: {{ recovery_url }}",
  "sampleId": "default",
  "locale": "en-US"
}
```

**Response:**

```json
{
  "ok": true,
  "text": "Hi John Doe! Complete your order: https://shop.myshopify.com/checkout/recovery/abc123",
  "warnings": [],
  "trigger": "abandoned_checkout",
  "sampleData": { ... }
}
```

### Validate Template

```http
POST /templates/validate
Content-Type: application/json

{
  "trigger": "order_created",
  "body": "Order {{ order_number }} confirmed!"
}
```

**Response:**

```json
{
  "ok": false,
  "errors": ["Missing required variables: order_total"],
  "warnings": [],
  "trigger": "order_created"
}
```

### List Variables

```http
GET /templates/variables/abandoned_checkout
```

**Response:**

```json
{
  "ok": true,
  "trigger": "abandoned_checkout",
  "variables": ["recovery_url", "checkout_id", "customer_name", ...],
  "schema": {
    "required": ["recovery_url", "checkout_id"],
    "optional": ["customer_name", "cart_total", ...],
    "description": "Abandoned checkout recovery"
  }
}
```

### List Triggers

```http
GET /templates/triggers
```

**Response:**

```json
{
  "ok": true,
  "triggers": [
    "abandoned_checkout",
    "order_created",
    "order_paid",
    "fulfillment_update",
    "welcome",
    "back_in_stock"
  ]
}
```

## Error Handling

### Template Rendering Errors

- **Missing variables:** Warnings for unknown variables in strict mode
- **Invalid syntax:** Liquid syntax errors are thrown as exceptions
- **Filter errors:** Invalid filter parameters are handled gracefully

### Validation Errors

- **Missing required variables:** Errors for missing critical variables
- **Unknown variables:** Warnings for variables not in trigger schema
- **Unsupported triggers:** Errors for invalid trigger types

## Best Practices

### Template Design

1. **Keep messages concise** - Aim for single SMS segments when possible
2. **Use default values** - Provide fallbacks for optional variables
3. **Test with real data** - Use preview endpoint with sample data
4. **Validate early** - Check templates before saving

### Variable Usage

1. **Use required variables** - Ensure all required variables are present
2. **Handle missing data** - Use default filter for optional variables
3. **Format appropriately** - Use money and date filters for proper formatting
4. **Consider localization** - Use locale parameter for international support

### SMS Optimization

1. **Monitor segmentation** - Check warnings for multi-part messages
2. **Avoid Unicode when possible** - Use GSM characters for better delivery
3. **Test delivery** - Verify messages work across different carriers
4. **Consider costs** - Multi-part messages cost more to send

## Examples

### Abandoned Checkout Recovery

```liquid
Hi {{ customer_name | default "there" }}!

Your cart is waiting at {{ shop_name }}. Complete your order now: {{ recovery_url }}

{{ cart_total | money currency }} • {{ checkout_id }}
```

### Order Confirmation

```liquid
Order {{ order_number }} confirmed!

Total: {{ order_total | money currency }}
Date: {{ order_date | date "short" timezone }}

View order: {{ order_url | shortlink }}
```

### Shipping Update

```liquid
Your order {{ order_number }} has shipped!

Tracking: {{ tracking_number }}
Carrier: {{ carrier | titlecase }}

Track here: {{ tracking_url | shortlink }}
```

### Welcome Message

```liquid
Welcome to {{ shop_name }}, {{ customer_name | titlecase }}!

Get {{ discount_value }}% off your first order with code {{ discount_code | upper }}.

Shop now: {{ shop_url | shortlink }}
```

### Back in Stock Alert

```liquid
Great news! {{ product_name }} is back in stock.

{{ inventory_count | default "Limited" }} quantity available.

Shop now: {{ product_url | shortlink }}
```
