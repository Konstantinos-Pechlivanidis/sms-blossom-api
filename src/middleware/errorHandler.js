import { logger } from '../lib/logger.js';

// Express error handler
export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const body = {
    error: true,
    message: err.expose ? err.message : 'Internal Server Error',
    requestId: req.id,
  };
  logger.error({ err, requestId: req.id }, 'request failed');
  res.status(status).json(body);
}
