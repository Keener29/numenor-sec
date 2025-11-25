/**
 * Error Handler Middleware Tests
 * Tests error handling middleware for AppError and unknown errors
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler, notFoundHandler } from '../errorHandler.js';
import { EmailServiceError, OAuthServiceError, TokenValidationError } from '../../types/email.js';

// Mock the service error handler
jest.mock('../../services/errorHandler.js', () => ({
  errorHandler: jest.fn()
}));

import { errorHandler as serviceErrorHandler } from '../../services/errorHandler.js';

describe('errorHandler middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      url: '/api/test',
      get: jest.fn().mockReturnValue('test-agent') as any,
      ip: '127.0.0.1',
      headers: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  it('should delegate to service error handler', () => {
    const error = new Error('Test error');
    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(serviceErrorHandler).toHaveBeenCalledWith(error, mockReq as any, mockRes as any, mockNext);
  });

  it('should handle AppError instances through service handler', () => {
    const appError = new EmailServiceError('Email service error', 'EMAIL_ERROR', 500);
    errorHandler(appError, mockReq as Request, mockRes as Response, mockNext);

    expect(serviceErrorHandler).toHaveBeenCalledWith(appError, mockReq as any, mockRes as any, mockNext);
  });

  it('should handle unknown errors through service handler', () => {
    const unknownError = new Error('Unknown error');
    errorHandler(unknownError, mockReq as Request, mockRes as Response, mockNext);

    expect(serviceErrorHandler).toHaveBeenCalledWith(unknownError, mockReq as any, mockRes as any, mockNext);
  });
});

describe('notFoundHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      path: '/api/nonexistent',
      method: 'GET'
    };
    mockRes = {
      status: jest.fn().mockReturnThis() as any,
      json: jest.fn().mockReturnThis() as any
    };
    jest.clearAllMocks();
  });

  it('should return 404 with correct error structure', () => {
    notFoundHandler(mockReq as Request, mockRes as Response);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'ENDPOINT_NOT_FOUND',
        message: 'API endpoint not found',
        statusCode: 404,
        details: {
          path: '/api/nonexistent',
          method: 'GET'
        },
        timestamp: expect.any(String)
      }
    });
  });

  it('should include request path and method in error details', () => {
    const testReq = {
      ...mockReq,
      path: '/api/test/endpoint',
      method: 'POST'
    };

    notFoundHandler(testReq as Request, mockRes as Response);

    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({
        details: {
          path: '/api/test/endpoint',
          method: 'POST'
        }
      })
    });
  });
});

