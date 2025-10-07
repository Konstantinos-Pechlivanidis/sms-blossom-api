// debug-health-simple.js
// Simple debug script to test health endpoint

import express from 'express';
import healthRouter from './src/routes/health.js';

const app = express();
app.use('/health', healthRouter);

// Add error handler to see what's happening
app.use((err, req, res, next) => {
  console.error('Error in health endpoint:', err);
  res.status(500).json({ error: err.message, stack: err.stack });
});

app.listen(3002, () => {
  console.log('Debug server running on port 3002');
  console.log('Test: http://localhost:3002/health');
});
