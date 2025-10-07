import express from 'express';
import crypto from 'crypto';

/**
 * Mock Mitto SMS API server for testing
 * Provides endpoints for SMS sending, DLR, and inbound messages
 */
export class MockMittoServer {
  constructor(port = 3002) {
    this.port = port;
    this.app = express();
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.server = null;

    // Track sent messages for testing
    this.sentMessages = new Map();
    this.messageCounter = 0;

    this.setupRoutes();
  }

  setupRoutes() {
    // SMS sending endpoint
    this.app.post('/api/v1/send', (req, res) => {
      const { to, text, from, callback_url } = req.body;

      if (!to || !text) {
        return res.status(400).json({
          error: 'Missing required fields: to, text',
        });
      }

      // Validate phone number format
      if (!/^\+[1-9]\d{1,14}$/.test(to)) {
        return res.status(400).json({
          error: 'Invalid phone number format',
        });
      }

      // Mock successful send
      const messageId = `msg_${Date.now()}_${++this.messageCounter}`;
      this.sentMessages.set(messageId, {
        to,
        text,
        from: from || 'SMSBLOSSOM',
        callback_url,
        status: 'sent',
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        message_id: messageId,
        status: 'sent',
        cost: this.calculateCost(text),
      });
    });

    // DLR (Delivery Receipt) endpoint
    this.app.post('/dlr', (req, res) => {
      const { message_id, status, error_code, error_message } = req.body;

      if (!message_id || !status) {
        return res.status(400).json({
          error: 'Missing required fields: message_id, status',
        });
      }

      const message = this.sentMessages.get(message_id);
      if (!message) {
        return res.status(404).json({
          error: 'Message not found',
        });
      }

      // Update message status
      message.status = status;
      message.delivered_at = new Date().toISOString();
      if (error_code) {
        message.error_code = error_code;
        message.error_message = error_message;
      }

      // Simulate callback to our webhook
      if (message.callback_url) {
        this.sendCallback(message.callback_url, {
          message_id,
          status,
          error_code,
          error_message,
        });
      }

      res.json({ success: true });
    });

    // Inbound messages endpoint
    this.app.post('/inbound', (req, res) => {
      const { from, text, timestamp: _timestamp } = req.body;

      if (!from || !text) {
        return res.status(400).json({
          error: 'Missing required fields: from, text',
        });
      }

      // Handle STOP/HELP commands
      const normalizedText = text.trim().toUpperCase();
      if (normalizedText === 'STOP') {
        // Simulate inbound STOP processing
        res.json({
          success: true,
          action: 'unsubscribe',
          message: 'You have been unsubscribed from SMS messages',
        });
      } else if (normalizedText === 'HELP') {
        res.json({
          success: true,
          action: 'help',
          message: 'Reply STOP to unsubscribe, HELP for help',
        });
      } else {
        res.json({
          success: true,
          action: 'received',
          message: 'Message received',
        });
      }
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        sent_messages: this.sentMessages.size,
      });
    });

    // Test endpoints for integration tests
    this.app.get('/test/messages', (req, res) => {
      const messages = Array.from(this.sentMessages.values());
      res.json({ messages });
    });

    this.app.delete('/test/messages', (req, res) => {
      this.sentMessages.clear();
      this.messageCounter = 0;
      res.json({ success: true });
    });

    // Simulate delivery receipt after delay
    this.app.post('/test/simulate-dlr', (req, res) => {
      const { message_id, status = 'delivered', delay = 1000 } = req.body;

      setTimeout(() => {
        const message = this.sentMessages.get(message_id);
        if (message && message.callback_url) {
          this.sendCallback(message.callback_url, {
            message_id,
            status,
            delivered_at: new Date().toISOString(),
          });
        }
      }, delay);

      res.json({ success: true, scheduled: true });
    });
  }

  calculateCost(text) {
    // Simple cost calculation based on text length
    const baseCost = 0.01;
    const perCharacter = 0.001;
    return baseCost + text.length * perCharacter;
  }

  async sendCallback(callbackUrl, data) {
    try {
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Mitto-Signature': this.generateSignature(data),
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        console.warn(`Callback failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.warn(`Callback error: ${error.message}`);
    }
  }

  generateSignature(data) {
    const secret = 'mock_webhook_secret';
    return crypto.createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex');
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Mock Mitto server running on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Mock Mitto server stopped');
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

  // Test helpers
  getSentMessages() {
    return Array.from(this.sentMessages.values());
  }

  clearMessages() {
    this.sentMessages.clear();
    this.messageCounter = 0;
  }
}
