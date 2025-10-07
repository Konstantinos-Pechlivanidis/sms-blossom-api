/**
 * SMS Blossom TypeScript SDK
 * 
 * A lightweight, type-safe client for the SMS Blossom API.
 * No external dependencies - uses native fetch API.
 */

// Types
export interface ApiConfig {
  baseUrl: string;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

export interface ApiError {
  status: number;
  message: string;
  error: string;
  details?: any;
}

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
  pii: {
    phone_pct: number | null;
    email_pct: number | null;
  };
  timestamp: string;
  request_id: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'failed';
  template: string;
  audience: {
    segment?: string;
    filter?: any;
    count: number;
  };
  metrics?: {
    sent: number;
    delivered: number;
    failed: number;
  };
  created_at: string;
  scheduled_at?: string;
}

export interface Discount {
  id: string;
  code: string;
  title: string;
  type: 'percentage' | 'amount' | 'shipping';
  value: number;
  currency_code: string;
  minimum_amount?: number;
  usage_limit?: number;
  used_count: number;
  created_at: string;
}

export interface TemplatePreview {
  rendered: string;
  segments: number;
  warnings: string[];
  variables_used: string[];
}

export interface ReportOverview {
  metrics: {
    total_campaigns: number;
    total_sent: number;
    total_delivered: number;
    delivery_rate: number;
    total_revenue: number;
  };
  cached_at: string;
}

export interface QueueHealth {
  redis: boolean;
  queues: {
    events: QueueCounts;
    automations: QueueCounts;
    campaigns: QueueCounts;
    delivery: QueueCounts;
    housekeeping: QueueCounts;
  };
  dlq: {
    events_dead: number;
    delivery_dead: number;
  };
  timestamp: string;
  request_id: string;
}

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

// API Client
export class SmsBlossomApi {
  private config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers = await this.config.getAuthHeaders();
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        errorData.message || response.statusText,
        errorData.error || 'api_error',
        errorData.details
      );
    }

    return response.json();
  }

  // Health endpoints
  health = {
    get: (): Promise<HealthResponse> => this.request('/health'),
    ready: (): Promise<{ ready: boolean; request_id: string }> => 
      this.request('/health/ready'),
  };

  // Template endpoints
  templates = {
    preview: (data: {
      template: string;
      variables: Record<string, any>;
    }): Promise<TemplatePreview> => 
      this.request('/templates/preview', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    validate: (data: {
      template: string;
      trigger: string;
    }): Promise<{
      valid: boolean;
      warnings: string[];
      variables_used: string[];
      missing_required: string[];
      unknown_variables: string[];
    }> => 
      this.request('/templates/validate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getVariables: (trigger: string): Promise<{
      trigger: string;
      variables: Array<{
        name: string;
        type: string;
        description: string;
      }>;
    }> => 
      this.request(`/templates/variables/${trigger}`),

    getTriggers: (): Promise<{
      triggers: Array<{
        name: string;
        description: string;
        variables: string[];
      }>;
    }> => 
      this.request('/templates/triggers'),
  };

  // Settings endpoints
  settings = {
    get: (): Promise<{
      timezone?: string;
      quietHours?: {
        start: number;
        end: number;
      };
      cap?: {
        windowHours: number;
        maxPerWindow: number;
      };
      abandoned?: {
        delayMinutes: number;
      };
    }> => 
      this.request('/settings'),

    update: (data: {
      timezone?: string;
      quietHours?: {
        start: number;
        end: number;
      };
      cap?: {
        windowHours: number;
        maxPerWindow: number;
      };
      abandoned?: {
        delayMinutes: number;
      };
    }): Promise<{
      success: boolean;
      settings: any;
    }> => 
      this.request('/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  };

  // Campaign endpoints
  campaigns = {
    list: (params?: {
      status?: string;
      limit?: number;
      offset?: number;
    }): Promise<{
      campaigns: Campaign[];
      pagination: {
        limit: number;
        offset: number;
        total: number;
      };
    }> => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.limit) query.set('limit', params.limit.toString());
      if (params?.offset) query.set('offset', params.offset.toString());
      
      return this.request(`/campaigns?${query.toString()}`);
    },

    create: (data: {
      name: string;
      template: string;
      audience: {
        segment?: string;
        filter?: any;
      };
      discount_id?: string;
      scheduled_at?: string;
      utm?: Record<string, string>;
    }): Promise<Campaign> => 
      this.request('/campaigns', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    get: (id: string): Promise<Campaign> => 
      this.request(`/campaigns/${id}`),

    update: (id: string, data: Partial<Campaign>): Promise<Campaign> => 
      this.request(`/campaigns/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string): Promise<{ success: boolean }> => 
      this.request(`/campaigns/${id}`, {
        method: 'DELETE',
      }),

    estimate: (id: string): Promise<{
      audience_count: number;
      estimated_cost: number;
      currency: string;
      segments: number;
      warnings: string[];
    }> => 
      this.request(`/campaigns/${id}/estimate`, {
        method: 'POST',
      }),

    testSend: (id: string, data: {
      phone: string;
      variables: Record<string, any>;
    }): Promise<{
      success: boolean;
      message_id: string;
      phone: string;
      rendered: string;
    }> => 
      this.request(`/campaigns/${id}/test-send`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    send: (id: string): Promise<{
      success: boolean;
      campaign_id: string;
      audience_count: number;
      estimated_cost: number;
      status: string;
    }> => 
      this.request(`/campaigns/${id}/send`, {
        method: 'POST',
      }),

    attachDiscount: (id: string, discountId: string): Promise<{
      success: boolean;
      campaign_id: string;
      discount_id: string;
      apply_url: string;
    }> => 
      this.request(`/campaigns/${id}/discount`, {
        method: 'POST',
        body: JSON.stringify({ discount_id: discountId }),
      }),

    detachDiscount: (id: string): Promise<{
      success: boolean;
      campaign_id: string;
    }> => 
      this.request(`/campaigns/${id}/discount`, {
        method: 'DELETE',
      }),

    setUtm: (id: string, utm: Record<string, string>): Promise<{
      success: boolean;
      campaign_id: string;
      utm: Record<string, string>;
    }> => 
      this.request(`/campaigns/${id}/utm`, {
        method: 'PUT',
        body: JSON.stringify({ utm }),
      }),

    getApplyUrl: (id: string): Promise<{
      apply_url: string;
      utm_params: Record<string, string>;
    }> => 
      this.request(`/campaigns/${id}/apply-url`),
  };

  // Discount endpoints
  discounts = {
    list: (): Promise<{
      discounts: Discount[];
    }> => 
      this.request('/discounts'),

    create: (data: {
      code: string;
      title: string;
      type: 'percentage' | 'amount' | 'shipping';
      value: number;
      currency_code: string;
      minimum_amount?: number;
      usage_limit?: number;
      starts_at?: string;
      ends_at?: string;
    }): Promise<Discount> => 
      this.request('/discounts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    get: (id: string): Promise<Discount> => 
      this.request(`/discounts/${id}`),

    update: (id: string, data: Partial<Discount>): Promise<Discount> => 
      this.request(`/discounts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string): Promise<{ success: boolean }> => 
      this.request(`/discounts/${id}`, {
        method: 'DELETE',
      }),

    checkConflicts: (data: {
      code: string;
    }): Promise<{
      conflicts: boolean;
      existing_discount: Discount | null;
    }> => 
      this.request('/discounts/conflicts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getApplyUrl: (id: string, utm?: Record<string, string>): Promise<{
      apply_url: string;
      utm_params: Record<string, string>;
    }> => 
      this.request(`/discounts/${id}/apply-url`, {
        method: 'POST',
        body: JSON.stringify({ utm }),
      }),
  };

  // Report endpoints
  reports = {
    overview: (params?: {
      from?: string;
      to?: string;
      window?: string;
    }): Promise<ReportOverview> => {
      const query = new URLSearchParams();
      if (params?.from) query.set('from', params.from);
      if (params?.to) query.set('to', params.to);
      if (params?.window) query.set('window', params.window);
      
      return this.request(`/reports/overview?${query.toString()}`);
    },

    campaigns: (params?: {
      from?: string;
      to?: string;
      campaign_id?: string;
    }): Promise<{
      campaigns: Array<{
        id: string;
        name: string;
        status: string;
        sent: number;
        delivered: number;
        failed: number;
        delivery_rate: number;
        cost: number;
        revenue: number;
        roi: number;
        created_at: string;
        sent_at: string;
      }>;
      summary: {
        total_campaigns: number;
        total_sent: number;
        total_delivered: number;
        total_cost: number;
        total_revenue: number;
        average_roi: number;
      };
      cached_at: string;
    }> => {
      const query = new URLSearchParams();
      if (params?.from) query.set('from', params.from);
      if (params?.to) query.set('to', params.to);
      if (params?.campaign_id) query.set('campaign_id', params.campaign_id);
      
      return this.request(`/reports/campaigns?${query.toString()}`);
    },

    messaging: (params?: {
      from?: string;
      to?: string;
      granularity?: 'hour' | 'day' | 'week' | 'month';
    }): Promise<{
      timeseries: Array<{
        date: string;
        sent: number;
        delivered: number;
        failed: number;
        delivery_rate: number;
        cost: number;
        revenue: number;
      }>;
      summary: {
        total_sent: number;
        total_delivered: number;
        total_failed: number;
        average_delivery_rate: number;
        total_cost: number;
        total_revenue: number;
      };
      cached_at: string;
    }> => {
      const query = new URLSearchParams();
      if (params?.from) query.set('from', params.from);
      if (params?.to) query.set('to', params.to);
      if (params?.granularity) query.set('granularity', params.granularity);
      
      return this.request(`/reports/messaging?${query.toString()}`);
    },
  };

  // Queue health endpoints
  queue = {
    health: (): Promise<QueueHealth> => 
      this.request('/queue/health'),
    
    metrics: (): Promise<{
      metrics: Array<{
        queue: string;
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
      }>;
      timestamp: string;
      request_id: string;
    }> => 
      this.request('/queue/metrics'),
  };

  // Metrics endpoints
  metrics = {
    get: (): Promise<string> => 
      this.request('/metrics'),
    
    getJson: (): Promise<{
      metrics: Array<{
        name: string;
        help: string;
        type: string;
        values: Array<{
          labels: Record<string, string>;
          value: number;
        }>;
      }>;
      timestamp: string;
      request_id: string;
    }> => 
      this.request('/metrics/json'),
  };
}

// Error class
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public error: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Factory function
export function createSmsBlossomApi(config: ApiConfig): SmsBlossomApi {
  return new SmsBlossomApi(config);
}

// Default export
export default SmsBlossomApi;
