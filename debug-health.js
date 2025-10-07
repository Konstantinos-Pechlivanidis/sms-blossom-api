// debug-health.js
// Simple debug script for health endpoint

import express from 'express';
import healthRouter from './src/routes/health.js';

const app = express();
app.use('/health', healthRouter);

app.get('/test', async (req, res) => {
  try {
    const response = await fetch('http://localhost:3001/health');
    const data = await response.text();
    res.json({ status: response.status, body: data });
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.listen(3001, () => {
  console.log('Debug server running on port 3001');
  console.log('Test: http://localhost:3001/test');
});
