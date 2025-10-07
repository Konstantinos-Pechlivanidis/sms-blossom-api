// src/providers/mitto.js
// Mitto SMS provider client with retries, backoff, and error classification

import { logger } from '../lib/logger.js';

// Type definitions removed for JavaScript compatibility

class MittoClient {
  constructor(config) {
    this.config = {
      timeout: 10000,
      maxRetries: 3,
      retryDelays: [100, 500, 2000],
      ...config,
    };
  }

  /**
   * Set request ID for correlation
   */
  setRequestId(requestId) {
    this.requestId = requestId;
  }

  /**
   * Send SMS via Mitto API
   */
  async sendSms(params) {
    const { to, text, meta, callback_url } = params;

    logger.info(
      {
        to,
        textLength: text.length,
        meta,
        callback_url,
        requestId: this.requestId,
      },
      'Sending SMS via Mitto',
    );

    const payload = {
      to,
      text,
      ...(meta && { meta }),
      ...(callback_url && { callback_url }),
    };

    return this.executeWithRetry(payload);
  }

  /**
   * Execute API call with retry logic
   */
  async executeWithRetry(payload, attempt = 1) {
    try {
      const response = await this.makeRequest(payload);

      logger.info(
        {
          provider_msg_id: response.provider_msg_id,
          status: response.status,
          attempt,
          requestId: this.requestId,
        },
        'SMS sent successfully via Mitto',
      );

      return response;
    } catch (error) {
      const mittoError = this.classifyError(error);

      if (mittoError.isTransient && attempt < this.config.maxRetries) {
        const delay = this.config.retryDelays[attempt - 1] || 2000;

        logger.warn(
          {
            error: mittoError.message,
            attempt,
            maxRetries: this.config.maxRetries,
            retryDelay: delay,
            requestId: this.requestId,
          },
          'Transient error, retrying SMS send',
        );

        await this.sleep(delay);
        return this.executeWithRetry(payload, attempt + 1);
      }

      logger.error(
        {
          error: mittoError.message,
          attempt,
          isTransient: mittoError.isTransient,
          statusCode: mittoError.statusCode,
          providerError: mittoError.providerError,
          requestId: this.requestId,
        },
        'SMS send failed permanently',
      );

      throw mittoError;
    }
  }

  /**
   * Make HTTP request to Mitto API
   */
  async makeRequest(payload) {
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.apiUrl}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          'X-Request-ID': this.requestId || '',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`Provider error: ${data.error}`);
      }

      return {
        provider_msg_id: data.id || data.message_id || data.provider_msg_id,
        status: data.status || 'sent',
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Classify errors as transient or permanent
   */
  classifyError(error) {
    const mittoError = error;

    // Network/timeout errors are transient
    if (error.name === 'AbortError' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      mittoError.isTransient = true;
      mittoError.message = 'Network timeout or connection error';
      return mittoError;
    }

    // HTTP status code classification
    if (error.message?.includes('HTTP')) {
      const statusMatch = error.message.match(/HTTP (\d+)/);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : 0;
      mittoError.statusCode = statusCode;

      // 5xx errors are transient
      if (statusCode >= 500) {
        mittoError.isTransient = true;
        mittoError.message = `Server error: ${error.message}`;
        return mittoError;
      }

      // 4xx errors are permanent (except 429 - rate limit)
      if (statusCode >= 400) {
        mittoError.isTransient = statusCode === 429;
        mittoError.message = `Client error: ${error.message}`;
        return mittoError;
      }
    }

    // Provider-specific error classification
    if (error.message?.includes('Provider error')) {
      const providerError = error.message.replace('Provider error: ', '');
      mittoError.providerError = providerError;

      // Rate limiting and temporary issues are transient
      if (
        providerError.includes('rate limit') ||
        providerError.includes('temporary') ||
        providerError.includes('timeout')
      ) {
        mittoError.isTransient = true;
        mittoError.message = `Provider temporary error: ${providerError}`;
        return mittoError;
      }

      // Invalid numbers, blocked content are permanent
      if (
        providerError.includes('invalid') ||
        providerError.includes('blocked') ||
        providerError.includes('forbidden')
      ) {
        mittoError.isTransient = false;
        mittoError.message = `Provider permanent error: ${providerError}`;
        return mittoError;
      }
    }

    // Default to transient for unknown errors
    mittoError.isTransient = true;
    mittoError.message = error.message || 'Unknown error';
    return mittoError;
  }

  /**
   * Sleep utility for retry delays
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.config.apiUrl}/health`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: globalThis.AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch (error) {
      logger.error({ error: error.message }, 'Mitto health check failed');
      return false;
    }
  }
}

// Singleton instance
let mittoClient = null;

/**
 * Get or create Mitto client instance
 */
export function getMittoClient() {
  if (!mittoClient) {
    const apiKey = process.env.MITTO_API_KEY;
    const apiUrl = process.env.MITTO_API_URL || 'https://api.mitto.com';

    if (!apiKey) {
      throw new Error('MITTO_API_KEY environment variable is required');
    }

    mittoClient = new MittoClient({
      apiKey,
      apiUrl,
      timeout: parseInt(process.env.MITTO_TIMEOUT || '10000'),
      maxRetries: parseInt(process.env.MITTO_MAX_RETRIES || '3'),
    });
  }

  return mittoClient;
}

/**
 * Send SMS with request ID correlation
 */
export async function sendSms(params) {
  const client = getMittoClient();

  if (params.requestId) {
    client.setRequestId(params.requestId);
  }

  return client.sendSms(params);
}

/**
 * Map Mitto errors to message status
 */
export function mapErrorToStatus(error) {
  if (error.isTransient) {
    return 'queued'; // Retry later
  }

  // Permanent errors
  if (error.statusCode === 400) {
    return 'failed'; // Bad request
  }

  if (error.statusCode === 401 || error.statusCode === 403) {
    return 'failed'; // Authentication/authorization
  }

  if (error.providerError?.includes('invalid')) {
    return 'failed'; // Invalid phone number
  }

  if (error.providerError?.includes('blocked')) {
    return 'failed'; // Blocked content
  }

  return 'failed'; // Default to failed
}

export { MittoClient };
