/**
 * Auth Middleware Tests
 * Tests authentication token validation
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import type { Response, NextFunction } from 'express';
import { authenticateToken, requireBusiness, type AuthRequest } from '../auth.js';
import jwt from 'jsonwebtoken';

// Mock jwt
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

describe('authenticateToken', () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      cookies: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any
    };
    mockNext = jest.fn();
    process.env.JWT_SECRET = 'test-secret';
    jest.clearAllMocks();
  });

  it('should return 401 when token is missing', () => {
    authenticateToken(mockReq as AuthRequest, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access token required' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 when token is missing from both header and cookies', () => {
    mockReq.headers = {};
    mockReq.cookies = {};

    authenticateToken(mockReq as AuthRequest, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access token required' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 500 when JWT_SECRET is not configured', () => {
    delete process.env.JWT_SECRET;
    mockReq.headers = { authorization: 'Bearer valid-token' };

    authenticateToken(mockReq as AuthRequest, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'JWT secret not configured' });
    expect(mockNext).not.toHaveBeenCalled();

    process.env.JWT_SECRET = 'test-secret';
  });

  it('should return 403 when token is invalid', () => {
    mockReq.headers = { authorization: 'Bearer invalid-token' };
    (jwt.verify as jest.Mock).mockImplementation((token, secret, callback: any) => {
      callback(new Error('Invalid token'), null);
    });

    authenticateToken(mockReq as AuthRequest, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should call next() when token is valid from Authorization header', () => {
    const mockUser = { id: 1, email: 'test@example.com', business_id: 1 };
    mockReq.headers = { authorization: 'Bearer valid-token' };
    (jwt.verify as jest.Mock).mockImplementation((token, secret, callback: any) => {
      callback(null, mockUser);
    });

    authenticateToken(mockReq as AuthRequest, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.user).toEqual(mockUser);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should call next() when token is valid from cookies', () => {
    const mockUser = { id: 1, email: 'test@example.com', business_id: 1 };
    mockReq.cookies = { authToken: 'valid-token' };
    (jwt.verify as jest.Mock).mockImplementation((token, secret, callback: any) => {
      callback(null, mockUser);
    });

    authenticateToken(mockReq as AuthRequest, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.user).toEqual(mockUser);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should prefer Authorization header token over cookie token', () => {
    const mockUser = { id: 1, email: 'test@example.com', business_id: 1 };
    mockReq.headers = { authorization: 'Bearer header-token' };
    mockReq.cookies = { authToken: 'cookie-token' };
    (jwt.verify as jest.Mock).mockImplementation((token, secret, callback: any) => {
      callback(null, mockUser);
    });

    authenticateToken(mockReq as AuthRequest, mockRes as Response, mockNext);

    expect(jwt.verify).toHaveBeenCalledWith('header-token', 'test-secret', expect.any(Function));
    expect(mockNext).toHaveBeenCalled();
  });
});

describe('requireBusiness', () => {
  let mockReq: Partial<AuthRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  it('should return 403 when user has no business_id', () => {
    mockReq.user = { id: 1, email: 'test@example.com' };

    requireBusiness(mockReq as AuthRequest, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Business access required' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should call next() when user has business_id', () => {
    mockReq.user = { id: 1, email: 'test@example.com', business_id: 1 };

    requireBusiness(mockReq as AuthRequest, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});

