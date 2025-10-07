# Frontend Feature Checklist

This document provides a comprehensive checklist for implementing each UI feature in the SMS Blossom frontend, including required endpoints, minimal UI states, feature flags, and telemetry.

## Overview

The frontend is a Shopify embedded app that communicates with the SMS Blossom backend API. Each feature section includes:

- **Required Endpoints**: API calls needed for the feature
- **UI States**: Minimal states the UI should handle
- **Feature Flags**: Environment-based feature toggles
- **Telemetry**: Events to track for analytics

## 1. Dashboard Overview

### Required Endpoints

- `GET /reports/overview` - Main dashboard metrics
- `GET /reports/messaging` - Messaging trends
- `GET /health` - System health status

### UI States

- **Loading**: Show skeleton while fetching data
- **Empty**: No data available (first-time setup)
- **Error**: API errors with retry option
- **Success**: Display metrics and charts

### Feature Flags

- `DASHBOARD_CHARTS_ENABLED` - Enable/disable chart visualizations
- `REAL_TIME_METRICS` - Show live metrics updates

### Telemetry

- `dashboard_viewed` - When dashboard is loaded
- `metric_clicked` - When user clicks on a metric
- `chart_interacted` - When user interacts with charts

## 2. Campaigns Management

### Required Endpoints

- `GET /campaigns` - List campaigns
- `POST /campaigns` - Create campaign
- `GET /campaigns/{id}` - Get campaign details
- `PUT /campaigns/{id}` - Update campaign
- `DELETE /campaigns/{id}` - Delete campaign
- `POST /campaigns/{id}/estimate` - Estimate campaign
- `POST /campaigns/{id}/test-send` - Test send campaign
- `POST /campaigns/{id}/send` - Send campaign

### UI States

- **List View**: Campaigns table with filters and pagination
- **Create Form**: Campaign creation wizard
- **Edit Form**: Campaign editing interface
- **Preview**: Template preview with variables
- **Estimate**: Audience size and cost estimation
- **Test Send**: Test message sending interface
- **Sending**: Campaign sending progress
- **Sent**: Campaign completion status

### Feature Flags

- `CAMPAIGN_TEMPLATES_ENABLED` - Enable template system
- `CAMPAIGN_SCHEDULING_ENABLED` - Enable campaign scheduling
- `CAMPAIGN_AUTOMATION_ENABLED` - Enable automation rules

### Telemetry

- `campaign_created` - When campaign is created
- `campaign_edited` - When campaign is modified
- `campaign_sent` - When campaign is sent
- `campaign_deleted` - When campaign is deleted
- `template_previewed` - When template is previewed
- `test_sent` - When test message is sent

## 3. Discounts Management

### Required Endpoints

- `GET /discounts` - List discounts
- `POST /discounts` - Create discount
- `GET /discounts/{id}` - Get discount details
- `PUT /discounts/{id}` - Update discount
- `DELETE /discounts/{id}` - Delete discount
- `POST /discounts/conflicts` - Check for conflicts
- `GET /discounts/{id}/apply-url` - Get apply URL

### UI States

- **List View**: Discounts table with status indicators
- **Create Form**: Discount creation form
- **Edit Form**: Discount editing interface
- **Conflict Check**: Conflict detection and resolution
- **Apply URL**: URL generation and testing

### Feature Flags

- `DISCOUNT_AUTOMATION_ENABLED` - Enable discount automation
- `DISCOUNT_CONFLICTS_ENABLED` - Enable conflict detection

### Telemetry

- `discount_created` - When discount is created
- `discount_edited` - When discount is modified
- `discount_deleted` - When discount is deleted
- `conflict_detected` - When conflict is found
- `apply_url_generated` - When apply URL is created

## 4. Templates System

### Required Endpoints

- `POST /templates/preview` - Preview template
- `POST /templates/validate` - Validate template
- `GET /templates/variables/{trigger}` - Get trigger variables
- `GET /templates/triggers` - Get available triggers

### UI States

- **Template Editor**: Rich text editor with Liquid syntax
- **Variable Picker**: Available variables for current trigger
- **Preview**: Rendered template preview
- **Validation**: Template validation results
- **SMS Segments**: Character count and segment information

### Feature Flags

- `TEMPLATE_LIQUID_ENABLED` - Enable Liquid templating
- `TEMPLATE_VARIABLES_ENABLED` - Enable variable system
- `TEMPLATE_VALIDATION_ENABLED` - Enable template validation

### Telemetry

- `template_edited` - When template is modified
- `template_previewed` - When template is previewed
- `template_validated` - When template is validated
- `variable_used` - When variable is inserted
- `sms_segment_calculated` - When SMS segments are calculated

## 5. Settings Configuration

### Required Endpoints

- `GET /settings` - Get current settings
- `PUT /settings` - Update settings

### UI States

- **Settings Form**: Configuration form with sections
- **Validation**: Settings validation and errors
- **Saved**: Success confirmation

### Feature Flags

- `SETTINGS_ADVANCED_ENABLED` - Enable advanced settings
- `SETTINGS_QUIET_HOURS_ENABLED` - Enable quiet hours configuration

### Telemetry

- `settings_viewed` - When settings page is loaded
- `settings_saved` - When settings are saved
- `setting_changed` - When individual setting is modified

## 6. Reports and Analytics

### Required Endpoints

- `GET /reports/overview` - Overview metrics
- `GET /reports/campaigns` - Campaign performance
- `GET /reports/messaging` - Messaging analytics
- `GET /queue/health` - Queue health status
- `GET /metrics` - System metrics

### UI States

- **Report Dashboard**: Charts and metrics display
- **Date Range Picker**: Time period selection
- **Export**: Report export functionality
- **Real-time**: Live metrics updates

### Feature Flags

- `REPORTS_EXPORT_ENABLED` - Enable report export
- `REPORTS_REAL_TIME_ENABLED` - Enable real-time updates
- `REPORTS_ADVANCED_ENABLED` - Enable advanced analytics

### Telemetry

- `report_viewed` - When report is viewed
- `report_exported` - When report is exported
- `date_range_changed` - When date range is modified
- `metric_drilled_down` - When metric is expanded

## 7. App Proxy Integration

### Required Endpoints

- `POST /proxy/consent` - Collect consent
- `POST /proxy/unsubscribe` - Handle unsubscribe
- `POST /proxy/back-in-stock/interest` - Back in stock interest

### UI States

- **Consent Form**: SMS consent collection
- **Unsubscribe**: Unsubscribe confirmation
- **Back in Stock**: Interest collection form
- **Success**: Confirmation messages

### Feature Flags

- `PROXY_CONSENT_ENABLED` - Enable consent collection
- `PROXY_UNSUBSCRIBE_ENABLED` - Enable unsubscribe handling
- `PROXY_BACK_IN_STOCK_ENABLED` - Enable back in stock feature

### Telemetry

- `consent_collected` - When consent is given
- `unsubscribe_processed` - When unsubscribe is processed
- `back_in_stock_interest` - When interest is expressed

## 8. Error Handling

### Required Endpoints

- All endpoints with proper error responses

### UI States

- **401 Unauthorized**: Redirect to login
- **409 Shop Not Installed**: Show installation prompt
- **429 Rate Limited**: Show rate limit message
- **500 Server Error**: Show error with retry option

### Feature Flags

- `ERROR_RETRY_ENABLED` - Enable automatic retry
- `ERROR_REPORTING_ENABLED` - Enable error reporting

### Telemetry

- `error_occurred` - When error is encountered
- `error_retried` - When error is retried
- `error_reported` - When error is reported

## 9. Authentication and Security

### Required Endpoints

- JWT token validation on all protected endpoints
- Shop scoping validation

### UI States

- **Authenticated**: Normal app interface
- **Unauthenticated**: Login prompt
- **Shop Not Installed**: Installation guide
- **Session Expired**: Token renewal prompt

### Feature Flags

- `AUTH_AUTO_RENEWAL_ENABLED` - Enable automatic token renewal
- `AUTH_STRICT_MODE_ENABLED` - Enable strict authentication

### Telemetry

- `auth_successful` - When authentication succeeds
- `auth_failed` - When authentication fails
- `token_renewed` - When token is renewed
- `session_expired` - When session expires

## 10. Performance and Optimization

### Required Endpoints

- Cached endpoints with proper cache headers
- Health check endpoints for monitoring

### UI States

- **Loading**: Skeleton screens and spinners
- **Cached**: Fast loading from cache
- **Offline**: Offline state handling

### Feature Flags

- `CACHE_ENABLED` - Enable client-side caching
- `OFFLINE_MODE_ENABLED` - Enable offline functionality
- `PERFORMANCE_MONITORING_ENABLED` - Enable performance tracking

### Telemetry

- `page_load_time` - Page load performance
- `api_response_time` - API response times
- `cache_hit_rate` - Cache hit rates
- `offline_detected` - When offline is detected

## Implementation Notes

### Environment Variables

```bash
# Required for all features
VITE_API_BASE_URL=https://api.sms-blossom.com
VITE_SHOP_DOMAIN=test-shop.myshopify.com

# Feature flags
VITE_DASHBOARD_CHARTS_ENABLED=true
VITE_CAMPAIGN_TEMPLATES_ENABLED=true
VITE_TEMPLATE_LIQUID_ENABLED=true
VITE_REPORTS_EXPORT_ENABLED=true
VITE_PROXY_CONSENT_ENABLED=true
VITE_ERROR_RETRY_ENABLED=true
VITE_AUTH_AUTO_RENEWAL_ENABLED=true
VITE_CACHE_ENABLED=true
VITE_PERFORMANCE_MONITORING_ENABLED=true
```

### SDK Usage

```typescript
import { SmsBlossomClient } from './sdk';

const client = new SmsBlossomClient({
  baseUrl: process.env.VITE_API_BASE_URL,
  shopDomain: process.env.VITE_SHOP_DOMAIN,
  token: sessionToken,
});

// Example: Get dashboard data
const overview = await client.reports.getOverview({
  from: '2024-01-01T00:00:00Z',
  to: '2024-01-31T23:59:59Z',
});
```

### Error Handling

```typescript
try {
  const result = await client.campaigns.create(campaignData);
} catch (error) {
  if (error.status === 401) {
    // Handle authentication error
    redirectToLogin();
  } else if (error.status === 409) {
    // Handle shop not installed
    showInstallationPrompt();
  } else if (error.status === 429) {
    // Handle rate limiting
    showRateLimitMessage();
  } else {
    // Handle other errors
    showErrorMessage(error.message);
  }
}
```

### Caching Strategy

```typescript
// Cache reports for 5 minutes
const cacheKey = `reports:overview:${dateRange}`;
const cached = await cache.get(cacheKey);
if (cached) {
  return cached;
}

const data = await client.reports.getOverview(dateRange);
await cache.set(cacheKey, data, 300); // 5 minutes
return data;
```

This checklist ensures comprehensive coverage of all frontend features while maintaining consistency with the backend API and providing clear implementation guidance.
