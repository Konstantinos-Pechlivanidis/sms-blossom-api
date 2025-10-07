// tests/app-proxy-verify.test.js
// Tests for App Proxy signature verification middleware

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appProxyVerifyMiddleware } from '../src/middleware/appProxyVerify.js';
import { verifyAppProxySignature as _verifyAppProxySignature } from '../src/lib/appProxyVerify.js';

// Mock the logger
vi.mock('../src/lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('App Proxy Verification Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      query: {},
      ip: '127.0.0.1',
      get: vi.fn().mockReturnValue('test-agent'),
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it('should pass valid signed query', () => {
    // Mock valid signature verification
    vi.spyOn(require('../src/lib/appProxyVerify.js'), 'verifyAppProxySignature').mockReturnValue(
      true,
    );

    req.query = {
      shop: 'test-shop.myshopify.com',
      timestamp: '1234567890',
      signature: 'valid-signature',
    };

    appProxyVerifyMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.proxyShopDomain).toBe('test-shop.myshopify.com');
  });

  it('should reject invalid signature', () => {
    // Mock invalid signature verification
    vi.spyOn(require('../src/lib/appProxyVerify.js'), 'verifyAppProxySignature').mockReturnValue(
      false,
    );

    req.query = {
      shop: 'test-shop.myshopify.com',
      timestamp: '1234567890',
      signature: 'invalid-signature',
    };

    appProxyVerifyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'invalid_signature',
      message: 'Request signature verification failed',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject missing shop parameter', () => {
    vi.spyOn(require('../src/lib/appProxyVerify.js'), 'verifyAppProxySignature').mockReturnValue(
      true,
    );

    req.query = {
      timestamp: '1234567890',
      signature: 'valid-signature',
    };

    appProxyVerifyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'missing_shop',
      message: 'Shop parameter is required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle verification errors gracefully', () => {
    vi.spyOn(require('../src/lib/appProxyVerify.js'), 'verifyAppProxySignature').mockImplementation(
      () => {
        throw new Error('Verification error');
      },
    );

    req.query = {
      shop: 'test-shop.myshopify.com',
      timestamp: '1234567890',
      signature: 'valid-signature',
    };

    appProxyVerifyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'verification_error',
      message: 'Internal error during signature verification',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should normalize shop domain to lowercase', () => {
    vi.spyOn(require('../src/lib/appProxyVerify.js'), 'verifyAppProxySignature').mockReturnValue(
      true,
    );

    req.query = {
      shop: 'TEST-SHOP.MYSHOPIFY.COM',
      timestamp: '1234567890',
      signature: 'valid-signature',
    };

    appProxyVerifyMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.proxyShopDomain).toBe('test-shop.myshopify.com');
  });
});
