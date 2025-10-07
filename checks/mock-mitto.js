// checks/mock-mitto.js
// Mock Mitto SMS API for testing

import express from 'express';
import crypto from 'crypto';

const app = express();
const PORT = process.env.MOCK_MITTO_PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mock SMS sending
app.post('/api/sendSms', (req, res) => {
  const { to, text, from } = req.body;
  
  // Simulate successful send
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  res.json({
    success: true,
    messageId,
    status: 'queued',
    cost: 0.05,
    parts: 1,
    encoding: 'GSM'
  });
});

// Mock DLR (Delivery Receipt) webhook
app.post('/webhooks/dlr', (req, res) => {
  const { messageId, status, timestamp } = req.body;
  
  // Simulate DLR processing
  console.log(`DLR received: ${messageId} - ${status}`);
  res.json({ received: true });
});

// Mock inbound SMS webhook
app.post('/webhooks/inbound', (req, res) => {
  const { from, text, timestamp } = req.body;
  
  // Simulate inbound message processing
  console.log(`Inbound SMS: ${from} - ${text}`);
  res.json({ received: true });
});

// Mock HMAC verification middleware
app.use((req, res, next) => {
  const hmac = req.get('X-Mitto-Hmac-Sha256');
  if (hmac) {
    req.verified = true;
  }
  next();
});

app.listen(PORT, () => {
  console.log(`Mock Mitto API running on http://localhost:${PORT}`);
});

export default app;
