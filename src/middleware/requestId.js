import { randomUUID } from 'node:crypto';

export function requestId() {
  return function requestIdMiddleware(req, _res, next) {
    const existing = req.headers['x-request-id'];
    req.id = typeof existing === 'string' && existing.length > 0 ? existing : randomUUID();
    next();
  };
}
