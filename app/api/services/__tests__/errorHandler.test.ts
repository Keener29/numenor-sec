/**
 * Error Handler Tests
 * Tests error handling middleware and error factory functions
 */

import { describe, expect, it, beforeEach } from '@jest/globals';
import { ErrorFactory, ErrorCodes, errorHandler, asyncHandler } from '../errorHandler.js';
import { EmailServiceError, OAuthServiceError, TokenValidationError } from '../../types/email.js';
import { ZodError } from 'zod';
import type { Request, Response, NextFunction } from 'express';

// Mock logger to avoid console output during tests
jest.mock('../logger.js', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}));

describe('ErrorFactory', () => {
  describe('emailService', () => {
    it('should create EmailServiceError with correct properties', () => {
      const error = ErrorFactory.emailService(
        ErrorCodes.EMAIL_SERVICE_NOT_CONFIGURED,
        'Email service not configured',
        500
      );

      expect(error).toBeInstanceOf(EmailServiceError);
      expect(error.message).toBe('Email service not configured');
      expect(error.code).toBe(ErrorCodes.EMAIL_SERVICE_NOT_CONFIGURED);
      expect(error.statusCode).toBe(500);
    });

    it('should include details when provided', () => {
      const details = { host: 'smtp.example.com', port: 587 };
      const error = ErrorFactory.emailService(
        ErrorCodes.EMAIL_SEND_FAILED,
        'Failed to send email',
        500,
        details
      );

      expect(error.details).toEqual(details);
    });
  });

  describe('oauthService', () => {
    it('should create OAuthServiceError with correct properties', () => {
      const error = ErrorFactory.oauthService(
        ErrorCodes.OAUTH_CONFIGURATION_ERROR,
        'OAuth not configured',
        500
      );

      expect(error).toBeInstanceOf(OAuthServiceError);
      expect(error.message).toBe('OAuth not configured');
      expect(error.code).toBe(ErrorCodes.OAUTH_CONFIGURATION_ERROR);
      expect(error.statusCode).toBe(500);
    });
  });

  describe('tokenValidation', () => {
    it('should create TokenValidationError with correct properties', () => {
      const error = ErrorFactory.tokenValidation(
        ErrorCodes.TOKEN_INVALID,
        'Token is invalid',
        403
      );

      expect(error).toBeInstanceOf(TokenValidationError);
      expect(error.message).toBe('Token is invalid');
      expect(error.code).toBe(ErrorCodes.TOKEN_INVALID);
      expect(error.statusCode).toBe(403);
    });

    it('should default to 403 status code', () => {
      const error = ErrorFactory.tokenValidation(
        ErrorCodes.TOKEN_EXPIRED,
        'Token expired'
      );

      expect(error.statusCode).toBe(403);
    });
  });

  describe('validation', () => {
    it('should create ApiError from ZodError', () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['email'],
          message: 'Expected string, received number'
        },
        {
          code: 'too_small',
          minimum: 8,
          type: 'string',
          inclusive: true,
          path: ['password'],
          message: 'String must contain at least 8 character(s)'
        }
      ]);

      const error = ErrorFactory.validation(zodError);

      expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.details).toBeDefined();
      expect((error.details as any).validationErrors).toHaveLength(2);
      expect((error.details as any).validationErrors[0].field).toBe('email');
      expect((error.details as any).validationErrors[1].field).toBe('password');
    });
  });

  describe('notFound', () => {
    it('should create not found error', () => {
      const error = ErrorFactory.notFound('User', '123');

      expect(error.code).toBe(ErrorCodes.RECORD_NOT_FOUND);
      expect(error.message).toBe('User not found: 123');
      expect(error.statusCode).toBe(404);
    });

    it('should create not found error without identifier', () => {
      const error = ErrorFactory.notFound('Resource');

      expect(error.message).toBe('Resource not found');
    });
  });

  describe('duplicate', () => {
    it('should create duplicate record error', () => {
      const error = ErrorFactory.duplicate('User', 'email', 'test@example.com');

      expect(error.code).toBe(ErrorCodes.DUPLICATE_RECORD);
      expect(error.message).toBe("User with email 'test@example.com' already exists");
      expect(error.statusCode).toBe(409);
      expect(error.details).toEqual({ field: 'email', value: 'test@example.com' });
    });
  });

  describe('authentication', () => {
    it('should create authentication error with default message', () => {
      const error = ErrorFactory.authentication();

      expect(error.code).toBe(ErrorCodes.AUTHENTICATION_REQUIRED);
      expect(error.message).toBe('Authentication required');
      expect(error.statusCode).toBe(401);
    });

    it('should create authentication error with custom message', () => {
      const error = ErrorFactory.authentication('Invalid credentials');

      expect(error.message).toBe('Invalid credentials');
    });
  });

  describe('authorization', () => {
    it('should create authorization error with default message', () => {
      const error = ErrorFactory.authorization();

      expect(error.code).toBe(ErrorCodes.AUTHORIZATION_FAILED);
      expect(error.message).toBe('Insufficient permissions');
      expect(error.statusCode).toBe(403);
    });

    it('should create authorization error with custom message', () => {
      const error = ErrorFactory.authorization('Access denied');

      expect(error.message).toBe('Access denied');
    });
  });

  describe('rateLimit', () => {
    it('should create rate limit error with default message', () => {
      const error = ErrorFactory.rateLimit();

      expect(error.code).toBe(ErrorCodes.RATE_LIMIT_EXCEEDED);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
    });

    it('should create rate limit error with custom message', () => {
      const error = ErrorFactory.rateLimit('Too many requests, please try again later');

      expect(error.message).toBe('Too many requests, please try again later');
    });
  });
});

describe('errorHandler middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      url: '/api/test',
      get: jest.fn().mockReturnValue('test-agent'),
      ip: '127.0.0.1',
      headers: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  it('should handle EmailServiceError correctly', () => {
    const error = ErrorFactory.emailService(
      ErrorCodes.EMAIL_SEND_FAILED,
      'Failed to send email',
      500
    );

    errorHandler(error as Error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({
        code: ErrorCodes.EMAIL_SEND_FAILED,
        message: 'Failed to send email',
        statusCode: 500
      })
    });
  });

  it('should handle OAuthServiceError correctly', () => {
    const error = ErrorFactory.oauthService(
      ErrorCodes.OAUTH_TOKEN_EXCHANGE_FAILED,
      'Token exchange failed',
      400
    );

    errorHandler(error as Error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({
        code: ErrorCodes.OAUTH_TOKEN_EXCHANGE_FAILED,
        message: 'Token exchange failed'
      })
    });
  });

  it('should handle TokenValidationError correctly', () => {
    const error = ErrorFactory.tokenValidation(
      ErrorCodes.TOKEN_INVALID,
      'Token is invalid'
    );

    errorHandler(error as Error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({
        code: ErrorCodes.TOKEN_INVALID,
        message: 'Token is invalid'
      })
    });
  });

  it('should handle ZodError correctly', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['email'],
        message: 'Invalid email'
      }
    ]);

    errorHandler(zodError, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed'
      })
    });
  });

  it('should handle generic errors correctly', () => {
    const error = new Error('Generic error');

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({
        code: ErrorCodes.INTERNAL_SERVER_ERROR,
        statusCode: 500
      })
    });
  });

  it('should include request ID in error response when present', () => {
    mockReq.headers = { 'x-request-id': 'test-request-id' };
    const error = new Error('Test error');

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({
        requestId: 'test-request-id'
      })
    });
  });

  it('should hide error message in production for generic errors', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const error = new Error('Sensitive error message');
    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({
        message: 'An internal server error occurred'
      })
    });

    process.env.NODE_ENV = originalEnv;
  });
});

describe('asyncHandler', () => {
  it('should wrap async function and catch errors', async () => {
    const mockReq = {} as Request;
    const mockRes = {} as Response;
    const mockNext = jest.fn();

    const asyncFn = jest.fn().mockRejectedValue(new Error('Test error'));
    const wrapped = asyncHandler(asyncFn);

    await wrapped(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should pass through successful async function results', async () => {
    const mockReq = {} as Request;
    const mockRes = {} as Response;
    const mockNext = jest.fn();

    const asyncFn = jest.fn().mockResolvedValue('success');
    const wrapped = asyncHandler(asyncFn);

    await wrapped(mockReq, mockRes, mockNext);

    expect(asyncFn).toHaveBeenCalled();
    expect(mockNext).not.toHaveBeenCalled();
  });
});

