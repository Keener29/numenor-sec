/**
 * Professional Error Handling Service
 * Provides consistent error handling, validation, and response formatting
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../../utils/logger.js';
import {
  EmailServiceError,
  OAuthServiceError,
  TokenValidationError
} from '../types/email.js';
import type { LogContext } from '../types/email.js';

// =============================================================================
// ERROR TYPES
// =============================================================================

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
  readonly timestamp: string;
  readonly requestId?: string;
}

export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly code: string;
}

// =============================================================================
// ERROR CODES
// =============================================================================

export const ErrorCodes = {
  // Email Service Errors
  EMAIL_SERVICE_NOT_CONFIGURED: 'EMAIL_SERVICE_NOT_CONFIGURED',
  EMAIL_SEND_FAILED: 'EMAIL_SEND_FAILED',
  EMAIL_TEMPLATE_ERROR: 'EMAIL_TEMPLATE_ERROR',
  EMAIL_VALIDATION_FAILED: 'EMAIL_VALIDATION_FAILED',

  // OAuth Service Errors
  OAUTH_CONFIGURATION_ERROR: 'OAUTH_CONFIGURATION_ERROR',
  OAUTH_TOKEN_EXCHANGE_FAILED: 'OAUTH_TOKEN_EXCHANGE_FAILED',
  OAUTH_TOKEN_REFRESH_FAILED: 'OAUTH_TOKEN_REFRESH_FAILED',
  OAUTH_AUTHORIZATION_FAILED: 'OAUTH_AUTHORIZATION_FAILED',
  OAUTH_STATE_VALIDATION_FAILED: 'OAUTH_STATE_VALIDATION_FAILED',

  // Token Validation Errors
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_MALFORMED: 'TOKEN_MALFORMED',
  TOKEN_MISSING: 'TOKEN_MISSING',

  // Database Errors
  DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
  DATABASE_QUERY_ERROR: 'DATABASE_QUERY_ERROR',
  RECORD_NOT_FOUND: 'RECORD_NOT_FOUND',
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',

  // Validation Errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
  INVALID_EMAIL_FORMAT: 'INVALID_EMAIL_FORMAT',
  INVALID_BUSINESS_ID: 'INVALID_BUSINESS_ID',

  // Authentication Errors
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED: 'AUTHORIZATION_FAILED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // External Service Errors
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  GMAIL_API_ERROR: 'GMAIL_API_ERROR',
  SMTP_SERVER_ERROR: 'SMTP_SERVER_ERROR',

  // Generic Errors
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
} as const;

// =============================================================================
// ERROR FACTORY FUNCTIONS
// =============================================================================

export class ErrorFactory {
  /**
   * Create an email service error
   */
  static emailService(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ): EmailServiceError {
    return new EmailServiceError(message, code, statusCode, details);
  }

  /**
   * Create an OAuth service error
   */
  static oauthService(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ): OAuthServiceError {
    return new OAuthServiceError(message, code, statusCode, details);
  }

  /**
   * Create a token validation error
   */
  static tokenValidation(
    code: string,
    message: string,
    statusCode: number = 403
  ): TokenValidationError {
    return new TokenValidationError(message, code, statusCode);
  }

  /**
   * Create a validation error from Zod error
   */
  static validation(zodError: ZodError): ApiError {
    const validationErrors: ValidationError[] = zodError.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code
    }));

    return {
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'Validation failed',
      statusCode: 400,
      details: { validationErrors },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create a not found error
   */
  static notFound(resource: string, identifier?: string): ApiError {
    let message = resource + ' not found';
    if (identifier) {
      message += ': ' + identifier;
    }
    return {
      code: ErrorCodes.RECORD_NOT_FOUND,
      message: message,
      statusCode: 404,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create a duplicate record error
   */
  static duplicate(resource: string, field: string, value: string): ApiError {
    return {
      code: ErrorCodes.DUPLICATE_RECORD,
      message: `${resource} with ${field} '${value}' already exists`,
      statusCode: 409,
      details: { field, value },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create an authentication error
   */
  static authentication(message: string = 'Authentication required'): ApiError {
    return {
      code: ErrorCodes.AUTHENTICATION_REQUIRED,
      message,
      statusCode: 401,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create an authorization error
   */
  static authorization(message: string = 'Insufficient permissions'): ApiError {
    return {
      code: ErrorCodes.AUTHORIZATION_FAILED,
      message,
      statusCode: 403,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create a rate limit error
   */
  static rateLimit(message: string = 'Rate limit exceeded'): ApiError {
    return {
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      message,
      statusCode: 429,
      timestamp: new Date().toISOString()
    };
  }
}

// =============================================================================
// ERROR HANDLING MIDDLEWARE
// =============================================================================

/**
 * Main error handling middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.headers['x-request-id'] as string;
  const context: LogContext = {
    requestId,
    operation: 'error-handler',
    metadata: {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    }
  };

  // Log the error
  logger.error('Unhandled error occurred', context, error);

  // Handle different error types
  if (error instanceof EmailServiceError || error instanceof OAuthServiceError) {
    handleEmailServiceError(error, res, requestId);
  } else if (error instanceof TokenValidationError) {
    handleTokenValidationError(error, res, requestId);
  } else if (error instanceof ZodError) {
    handleValidationError(error, res, requestId);
  } else {
    handleGenericError(error, res, requestId);
  }
}

/**
 * Handle email service errors
 */
function handleEmailServiceError(
  error: EmailServiceError,
  res: Response,
  requestId?: string
): void {
  const apiError: ApiError = {
    code: error.code,
    message: error.message,
    statusCode: error.statusCode,
    details: error.details,
    timestamp: new Date().toISOString(),
    requestId
  };

  res.status(error.statusCode).json({
    success: false,
    error: apiError
  });
}

/**
 * Handle token validation errors
 */
function handleTokenValidationError(
  error: TokenValidationError,
  res: Response,
  requestId?: string
): void {
  const apiError: ApiError = {
    code: error.code,
    message: error.message,
    statusCode: error.statusCode,
    timestamp: new Date().toISOString(),
    requestId
  };

  res.status(error.statusCode).json({
    success: false,
    error: apiError
  });
}

/**
 * Handle validation errors
 */
function handleValidationError(
  error: ZodError,
  res: Response,
  requestId?: string
): void {
  const apiError = ErrorFactory.validation(error);
  (apiError as any).requestId = requestId;

  res.status(apiError.statusCode).json({
    success: false,
    error: apiError
  });
}

/**
 * Handle generic errors
 */
function handleGenericError(
  error: Error,
  res: Response,
  requestId?: string
): void {
  const apiError: ApiError = {
    code: ErrorCodes.INTERNAL_SERVER_ERROR,
    message: process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred'
      : error.message,
    statusCode: 500,
    timestamp: new Date().toISOString(),
    requestId
  };

  res.status(500).json({
    success: false,
    error: apiError
  });
}

// =============================================================================
// ASYNC ERROR WRAPPER
// =============================================================================

/**
 * Wrapper for async route handlers to catch errors
 */
export function asyncHandler<T extends any[]>(
  fn: (...args: T) => Promise<any>
) {
  return (...args: T): Promise<any> => {
    const [, , next] = args;
    return Promise.resolve(fn(...args)).catch(next);
  };
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate email address format
 */
export function validateEmailAddress(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate business ID
 */
export function validateBusinessId(businessId: unknown): businessId is number {
  return typeof businessId === 'number' && businessId > 0;
}

/**
 * Validate email ID
 */
export function validateEmailId(emailId: unknown): emailId is number {
  return typeof emailId === 'number' && emailId > 0;
}

// =============================================================================
// RESPONSE HELPERS
// =============================================================================

/**
 * Send success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  message?: string
): void {
  const response: any = {
    success: true,
    data
  };

  if (message) {
    response.message = message;
  }

  res.status(statusCode).json(response);
}

/**
 * Send error response
 */
export function sendError(
  res: Response,
  error: ApiError,
  statusCode?: number
): void {
  res.status(statusCode || error.statusCode).json({
    success: false,
    error
  });
}
