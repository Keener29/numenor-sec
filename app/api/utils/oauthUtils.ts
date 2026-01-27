/**
 * OAuth Route Utilities
 * Shared helper functions for OAuth route handlers
 */

import type { Request, Response } from 'express';
import { query } from '../../db/connection.js';
import { securityEventLogger } from './securityEventLogger.js';
import { oauthLogger } from '../../utils/logger.js';
import { OAuthStateValidationError } from '../services/oauth/base/stateValidation.js';

/**
 * Get target business ID from request (either from query params, approve token, or JWT)
 */
export async function getTargetBusinessId(
  req: Request,
  res: Response,
  businessId?: number,
  approveToken?: string
): Promise<number | null> {
  if (businessId || approveToken) {
    if (!businessId) {
      res.status(400).json({ success: false, error: 'businessId is required when using approveToken' });
      return null;
    }
    return businessId;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return null;
  }

  const jwt = require('jsonwebtoken');
  try {
    const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET!) as { business_id: number };
    return decoded.business_id;
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: 'Invalid authentication token' });
      return null;
    }
    throw err; // unexpected
  }
}

/**
 * Handle email approval token validation and logging
 */
export async function handleApprovalToken(
  req: Request,
  emailId: number,
  businessId: number,
  approveToken: string
): Promise<boolean> {
  const { tokenService } = await import('./tokenService.js');

  if (!tokenService.validateApprovalToken(approveToken, emailId, businessId)) {
    return false;
  }

  // Mark email as approved
  await query('UPDATE monitored_emails SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [emailId]);

  // Log the approval event
  const emailAddress = req.query.emailAddress;

  if (typeof emailAddress !== 'string') {
    throw new TypeError('Invalid emailAddress parameter, expected string');
  }
  
  await securityEventLogger.logSecurityEvent(
    businessId,
    'email_approved',
    `Email monitoring approved for: ${emailAddress}`,
    {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }
  );

  return true;
}

/**
 * Handle OAuth callback error and log security event
 * @param error - Error query parameter from OAuth callback
 * @param state - State query parameter from OAuth callback
 * @param req - Express request object
 * @param frontendUrl - Frontend URL for redirect (can be undefined)
 * @param provider - OAuth provider name (e.g., 'microsoft', 'gmail')
 * @returns Redirect URL string if error was handled, null otherwise
 */
export async function handleOAuthCallbackError(
  error: unknown,
  state: string | undefined,
  req: Request,
  frontendUrl: string | undefined,
  provider: 'gmail' | 'microsoft'
): Promise<string | null> {
  if (!error) {
    return null;
  }

  // Extract error message
  let msg: string;

  if (error instanceof Error) {
    msg = error.message;
  } else if (typeof error === 'string') {
    msg = error;
  } else {
    msg = JSON.stringify(error, Object.getOwnPropertyNames(error));
  }

  // Log OAuth failure if we have state data
  try {
    if (state) {
      const stateData = JSON.parse(state);
      const { businessId, emailAddress } = stateData;
      await securityEventLogger.logSecurityEvent(
        businessId,
        'oauth_failed',
        `${provider === 'microsoft' ? 'Microsoft' : 'Gmail'} OAuth connection failed for: ${emailAddress}`,
        {
          error: msg,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );
    }
  } catch (logError) {
    // Don't fail the redirect if logging fails
    oauthLogger.warn('Failed to log OAuth failure event', {
      operation: 'oauth-callback-logging'
    }, {
      error: logError instanceof Error ? logError.message : String(logError)
    });
  }

  return `${frontendUrl}/success?oauth_error=${encodeURIComponent(msg)}`;
}

/**
 * Handle OAuth state validation errors and log security events
 * @param err - Error caught from OAuth callback handler
 * @param req - Express request object
 * @param frontendUrl - Frontend URL for redirect
 * @param provider - OAuth provider name (e.g., 'microsoft', 'gmail')
 * @returns Redirect URL string for invalid state error
 */
export async function handleOAuthStateValidationError(
  err: unknown,
  req: Request,
  frontendUrl: string,
  provider: 'gmail' | 'microsoft'
): Promise<string> {
  // Handle OAuth state validation errors with safe metadata extraction
  if (err instanceof OAuthStateValidationError && err.metadata) {
    try {
      const { businessId, emailAddress } = err.metadata;
      if (businessId && emailAddress) {
        await securityEventLogger.logSecurityEvent(
          businessId,
          'oauth_failed',
          `${provider === 'microsoft' ? 'Microsoft' : 'Gmail'} OAuth connection failed - invalid state for: ${emailAddress}`,
          {
            error: err.message,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
          }
        );
      }
    } catch (logError) {
      // Don't fail the redirect if logging fails
      oauthLogger.warn('Failed to log OAuth failure event', {
        operation: 'oauth-callback-logging'
      }, {
        error: logError instanceof Error ? logError.message : String(logError)
      });
    }
  }
  return `${frontendUrl}/success?oauth_error=invalid_state`;
}

