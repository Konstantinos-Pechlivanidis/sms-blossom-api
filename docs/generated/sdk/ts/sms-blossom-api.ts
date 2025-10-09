/**
 * SMS Blossom API TypeScript SDK
 * Generated from OpenAPI 3.1 specification
 * Version: 1.0.0
 */

export interface ApiConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: any,
    message?: string
  ) {
    super(message || `API Error: ${status} ${statusText}`);
    this.name = 'ApiError';
  }
}

export class SmsBlossomApi {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeout || this.config.timeout
    );

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new ApiError(
          response.status,
          response.statusText,
          errorBody,
          errorBody.message
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, 'Network Error', null, error.message);
    }
  }

  // Health & System
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health');
  }

  async getReadiness(): Promise<ReadinessResponse> {
    return this.request<ReadinessResponse>('GET', '/health/ready');
  }

  async getQueueHealth(): Promise<QueueHealthResponse> {
    return this.request<QueueHealthResponse>('GET', '/queue/health');
  }

  async getMetrics(): Promise<string> {
    return this.request<string>('GET', '/metrics');
  }

  // Authentication
  async installApp(shop: string, hmac?: string, timestamp?: string, state?: string): Promise<void> {
    const params = new URLSearchParams({ shop });
    if (hmac) params.append('hmac', hmac);
    if (timestamp) params.append('timestamp', timestamp);
    if (state) params.append('state', state);
    
    return this.request<void>('GET', `/auth/install?${params.toString()}`);
  }

  async handleOAuthCallback(
    code: string,
    shop: string,
    state?: string,
    hmac?: string
  ): Promise<OAuthCallbackResponse> {
    const params = new URLSearchParams({ code, shop });
    if (state) params.append('state', state);
    if (hmac) params.append('hmac', hmac);
    
    return this.request<OAuthCallbackResponse>('GET', `/auth/callback?${params.toString()}`);
  }

  // Campaigns
  async listCampaigns(
    shop: string,
    page = 1,
    limit = 20,
    status?: CampaignStatus
  ): Promise<CampaignListResponse> {
    const params = new URLSearchParams({ shop, page: page.toString(), limit: limit.toString() });
    if (status) params.append('status', status);
    
    return this.request<CampaignListResponse>('GET', `/campaigns?${params.toString()}`);
  }

  async createCampaign(shop: string, data: CreateCampaignRequest): Promise<Campaign> {
    return this.request<Campaign>('POST', `/campaigns?shop=${shop}`, data);
  }

  async getCampaign(id: string, shop: string): Promise<Campaign> {
    return this.request<Campaign>('GET', `/campaigns/${id}?shop=${shop}`);
  }

  async updateCampaign(id: string, shop: string, data: UpdateCampaignRequest): Promise<Campaign> {
    return this.request<Campaign>('PUT', `/campaigns/${id}?shop=${shop}`, data);
  }

  async deleteCampaign(id: string, shop: string): Promise<void> {
    return this.request<void>('DELETE', `/campaigns/${id}?shop=${shop}`);
  }

  async estimateCampaign(id: string, shop: string): Promise<CampaignEstimate> {
    return this.request<CampaignEstimate>('POST', `/campaigns/${id}/estimate?shop=${shop}`);
  }

  async testSendCampaign(id: string, shop: string, phone: string, variables?: Record<string, any>): Promise<TestSendResponse> {
    return this.request<TestSendResponse>('POST', `/campaigns/${id}/test?shop=${shop}`, {
      phone,
      variables,
    });
  }

  async sendCampaign(id: string, shop: string): Promise<SendCampaignResponse> {
    return this.request<SendCampaignResponse>('POST', `/campaigns/${id}/send?shop=${shop}`);
  }

  // Discounts
  async listDiscounts(
    shop: string,
    page = 1,
    limit = 20,
    status?: DiscountStatus
  ): Promise<DiscountListResponse> {
    const params = new URLSearchParams({ shop, page: page.toString(), limit: limit.toString() });
    if (status) params.append('status', status);
    
    return this.request<DiscountListResponse>('GET', `/discounts?${params.toString()}`);
  }

  async createDiscount(shop: string, data: CreateDiscountRequest): Promise<Discount> {
    return this.request<Discount>('POST', `/discounts?shop=${shop}`, data);
  }

  async getDiscount(id: string, shop: string): Promise<Discount> {
    return this.request<Discount>('GET', `/discounts/${id}?shop=${shop}`);
  }

  async updateDiscount(id: string, shop: string, data: UpdateDiscountRequest): Promise<Discount> {
    return this.request<Discount>('PUT', `/discounts/${id}?shop=${shop}`, data);
  }

  async deleteDiscount(id: string, shop: string): Promise<void> {
    return this.request<void>('DELETE', `/discounts/${id}?shop=${shop}`);
  }

  async checkDiscountConflicts(shop: string, code: string, excludeId?: string): Promise<DiscountConflictsResponse> {
    return this.request<DiscountConflictsResponse>('POST', `/discounts/conflicts?shop=${shop}`, {
      code,
      excludeId,
    });
  }

  // Templates
  async listTemplates(shop: string, trigger?: TemplateTrigger): Promise<TemplateListResponse> {
    const params = new URLSearchParams({ shop });
    if (trigger) params.append('trigger', trigger);
    
    return this.request<TemplateListResponse>('GET', `/templates?${params.toString()}`);
  }

  async createTemplate(shop: string, data: CreateTemplateRequest): Promise<Template> {
    return this.request<Template>('POST', `/templates?shop=${shop}`, data);
  }

  async previewTemplate(data: PreviewTemplateRequest): Promise<TemplatePreviewResponse> {
    return this.request<TemplatePreviewResponse>('POST', '/templates/preview', data);
  }

  async validateTemplate(data: ValidateTemplateRequest): Promise<TemplateValidationResponse> {
    return this.request<TemplateValidationResponse>('POST', '/templates/validate', data);
  }

  async getTemplateVariables(trigger: TemplateTrigger): Promise<TemplateVariablesResponse> {
    return this.request<TemplateVariablesResponse>('GET', `/templates/variables/${trigger}`);
  }

  // Segments
  async listSegments(shop: string, page = 1, limit = 20): Promise<SegmentListResponse> {
    const params = new URLSearchParams({ shop, page: page.toString(), limit: limit.toString() });
    return this.request<SegmentListResponse>('GET', `/segments?${params.toString()}`);
  }

  async createSegment(shop: string, data: CreateSegmentRequest): Promise<Segment> {
    return this.request<Segment>('POST', `/segments?shop=${shop}`, data);
  }

  async previewSegment(shop: string, filterJson: Record<string, any>): Promise<SegmentPreviewResponse> {
    return this.request<SegmentPreviewResponse>('POST', `/segments/preview?shop=${shop}`, {
      filterJson,
    });
  }

  // Reports
  async getOverviewReport(
    shop: string,
    period?: ReportPeriod,
    startDate?: string,
    endDate?: string
  ): Promise<OverviewReport> {
    const params = new URLSearchParams({ shop });
    if (period) params.append('period', period);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    return this.request<OverviewReport>('GET', `/reports/overview?${params.toString()}`);
  }

  async getMessagingReport(
    shop: string,
    period: ReportPeriod = '30d',
    groupBy: ReportGroupBy = 'day'
  ): Promise<MessagingReport> {
    const params = new URLSearchParams({ shop, period, groupBy });
    return this.request<MessagingReport>('GET', `/reports/messaging?${params.toString()}`);
  }

  // Settings
  async getSettings(shop: string): Promise<ShopSettings> {
    return this.request<ShopSettings>('GET', `/settings?shop=${shop}`);
  }

  async updateSettings(shop: string, data: UpdateSettingsRequest): Promise<ShopSettings> {
    return this.request<ShopSettings>('PUT', `/settings?shop=${shop}`, data);
  }

  // Public Endpoints
  async publicUnsubscribe(phone: string, shop: string): Promise<PublicUnsubscribeResponse> {
    return this.request<PublicUnsubscribeResponse>('POST', '/public/unsubscribe', {
      phone,
      shop,
    });
  }

  async publicBackInStock(
    phone: string,
    shop: string,
    productId: string,
    variantId: string
  ): Promise<PublicBackInStockResponse> {
    return this.request<PublicBackInStockResponse>('POST', '/public/back-in-stock', {
      phone,
      shop,
      productId,
      variantId,
    });
  }
}

// Type Definitions
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'failed';
export type DiscountStatus = 'active' | 'expired' | 'scheduled';
export type TemplateTrigger = 'abandoned_checkout' | 'order_created' | 'order_paid' | 'fulfillment_update' | 'welcome' | 'back_in_stock';
export type ReportPeriod = '7d' | '30d' | '90d' | '1y';
export type ReportGroupBy = 'day' | 'week' | 'month';

export interface HealthResponse {
  ok: boolean;
  version: string;
  db: {
    ok: boolean;
    latency_ms: number;
  };
  redis: {
    ok: boolean;
    latency_ms: number;
  };
  queues: {
    ok: boolean;
    workers: number;
  };
  pii?: {
    phone_pct?: number;
    email_pct?: number;
  };
  timestamp: string;
  request_id: string;
}

export interface ReadinessResponse {
  ready: boolean;
  request_id: string;
}

export interface QueueHealthResponse {
  redis: boolean;
  queues: {
    events: QueueStatus;
    automations: QueueStatus;
    campaigns: QueueStatus;
    delivery: QueueStatus;
    housekeeping: QueueStatus;
  };
  dlq: {
    events_dead: number;
    delivery_dead: number;
  };
  timestamp: string;
  request_id: string;
}

export interface QueueStatus {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  drained: number;
}

export interface OAuthCallbackResponse {
  success: boolean;
  shop: string;
  token: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  template?: string;
  segmentId?: string;
  templateId?: string;
  templateKey?: string;
  scheduleAt?: string;
  utmJson?: Record<string, any>;
  batchSize?: number;
  bodyText?: string;
  discountId?: string;
  shopId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignRequest {
  name: string;
  template?: string;
  segmentId?: string;
  templateId?: string;
  templateKey?: string;
  scheduleAt?: string;
  utmJson?: Record<string, any>;
  batchSize?: number;
  bodyText?: string;
  discountId?: string;
}

export interface UpdateCampaignRequest {
  name?: string;
  template?: string;
  segmentId?: string;
  scheduleAt?: string;
  status?: CampaignStatus;
}

export interface CampaignListResponse {
  data: Campaign[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CampaignEstimate {
  estimatedRecipients: number;
  estimatedCost: number;
  segmentsUsed: number;
  warnings?: string[];
}

export interface TestSendResponse {
  success: boolean;
  messageId: string;
}

export interface SendCampaignResponse {
  success: boolean;
  campaignId: string;
  estimatedRecipients: number;
}

export interface Discount {
  id: string;
  code: string;
  title?: string;
  type: 'percentage' | 'amount' | 'shipping';
  value?: number;
  currencyCode?: string;
  startsAt?: string;
  endsAt?: string;
  usageLimit?: number;
  oncePerCustomer?: boolean;
  applyUrl?: string;
  providerId?: string;
  status?: DiscountStatus;
  utmJson?: Record<string, any>;
  shopId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDiscountRequest {
  code: string;
  title?: string;
  type: 'percentage' | 'amount' | 'shipping';
  value?: number;
  currencyCode?: string;
  startsAt?: string;
  endsAt?: string;
  usageLimit?: number;
  oncePerCustomer?: boolean;
  utmJson?: Record<string, any>;
}

export interface UpdateDiscountRequest {
  title?: string;
  value?: number;
  startsAt?: string;
  endsAt?: string;
  usageLimit?: number;
  oncePerCustomer?: boolean;
}

export interface DiscountListResponse {
  data: Discount[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface DiscountConflictsResponse {
  hasConflicts: boolean;
  conflicts: DiscountConflict[];
  suggestions?: string[];
}

export interface DiscountConflict {
  id: string;
  code: string;
  type: string;
  conflictType: 'exact_match' | 'similar_code' | 'overlapping_period';
  message: string;
}

export interface Template {
  id: string;
  name: string;
  trigger: TemplateTrigger;
  body: string;
  variables?: Record<string, any>;
  shopId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateRequest {
  name: string;
  trigger: TemplateTrigger;
  body: string;
  variables?: Record<string, any>;
}

export interface TemplateListResponse {
  data: Template[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface PreviewTemplateRequest {
  body: string;
  variables?: Record<string, any>;
  locale?: string;
}

export interface TemplatePreviewResponse {
  text: string;
  warnings?: string[];
  segments: SMSSegments;
}

export interface ValidateTemplateRequest {
  body: string;
  trigger: TemplateTrigger;
}

export interface TemplateValidationResponse {
  ok: boolean;
  errors: string[];
  warnings?: string[];
}

export interface TemplateVariablesResponse {
  required: string[];
  optional: string[];
  description: string;
}

export interface SMSSegments {
  parts: number;
  characters: number;
  encoding: 'GSM' | 'Unicode';
}

export interface Segment {
  id: string;
  name: string;
  filterJson: Record<string, any>;
  lastMaterializedAt?: string;
  shopId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSegmentRequest {
  name: string;
  filterJson: Record<string, any>;
}

export interface SegmentListResponse {
  data: Segment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface SegmentPreviewResponse {
  estimatedCount: number;
  filter: Record<string, any>;
  warnings?: string[];
}

export interface OverviewReport {
  period: {
    start: string;
    end: string;
  };
  totalMessages: number;
  deliveredMessages: number;
  failedMessages: number;
  optOuts: number;
  revenue: number;
  averageDeliveryTime: number;
  topCampaigns: Array<{
    id: string;
    name: string;
    messages: number;
    revenue: number;
  }>;
}

export interface MessagingReport {
  period: {
    start: string;
    end: string;
  };
  timeseries: Array<{
    date: string;
    sent: number;
    delivered: number;
    failed: number;
    optOuts: number;
  }>;
  summary: {
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    totalOptOuts: number;
    deliveryRate: number;
    optOutRate: number;
  };
}

export interface ShopSettings {
  shopId: string;
  timezone: string;
  locale: string;
  automations: {
    abandoned_checkout?: {
      enabled: boolean;
      delay_minutes: number;
      template: string;
    };
    welcome?: {
      enabled: boolean;
      delay_minutes: number;
      template: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSettingsRequest {
  timezone?: string;
  locale?: string;
  automations?: {
    abandoned_checkout?: {
      enabled: boolean;
      delay_minutes: number;
      template: string;
    };
    welcome?: {
      enabled: boolean;
      delay_minutes: number;
      template: string;
    };
  };
}

export interface PublicUnsubscribeResponse {
  success: boolean;
  message: string;
}

export interface PublicBackInStockResponse {
  success: boolean;
  message: string;
}

// Export default instance factory
export function createApiClient(config: ApiConfig): SmsBlossomApi {
  return new SmsBlossomApi(config);
}

export default SmsBlossomApi;
