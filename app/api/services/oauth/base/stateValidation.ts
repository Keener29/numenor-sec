/**
 * Shared OAuth State Validation
 * Validates OAuth state parameters with signature verification and nonce verification to prevent CSRF attacks and tampering
 */

import { query } from '../../../../db/connection.js';
import { oauthLogger } from '../../../../utils/logger.js';
import { ErrorFactory, ErrorCodes } from '../../errorHandler.js';
import crypto from 'node:crypto';
import type { OAuthState, LogContext } from './types.js';
import { verifyOAuthState } from './stateSigning.js';

/**
 * OAuth State Validation Error
 * Includes metadata for safe logging without parsing attacker-controlled input
 */
export class OAuthStateValidationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly metadata?: {
    businessId?: number;
    emailAddress?: string;
    provider?: string;
  };

  constructor(
    message: string,
    code: string = ErrorCodes.OAUTH_STATE_VALIDATION_FAILED,
    statusCode: number = 400,
    metadata?: { businessId?: number; emailAddress?: string; provider?: string }
  ) {
    super(message);
    this.name = 'OAuthStateValidationError';
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;
  }
}

/**
 * Generate a cryptographically secure nonce for OAuth state parameter
 * Uses crypto.randomBytes() for security (128 bits of entropy)
 * Returns base64url-encoded string (URL-safe, no padding)
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Validate OAuth state parameter with nonce verification
 * Prevents CSRF attacks by verifying the nonce was issued by the server
 * 
 * @param state - The OAuth state string from the callback
 * @param expectedProvider - The expected provider ('gmail' or 'outlook')
 * @returns Validated OAuth state data
 * @throws OAuthServiceError if validation fails
 */
export async function validateOAuthState(
  state: string,
  expectedProvider: 'gmail' | 'outlook'
): Promise<OAuthState> {
  const context: LogContext = { operation: 'validate-state' };
  
  // SECURITY: Verify signature first to prevent tampering
  // Never parse attacker-controlled input - only use verified state
  const stateData: OAuthState | null = verifyOAuthState(state);
  
  if (!stateData) {
    // Signature verification failed - do not parse attacker-controlled input
    throw new OAuthStateValidationError(
      'Invalid or expired OAuth state parameter',
      ErrorCodes.OAUTH_STATE_VALIDATION_FAILED,
      400
    );
  }

  // Extract metadata safely from verified state (for error reporting)
  const extractedMetadata = {
    businessId: stateData.businessId,
    emailAddress: stateData.emailAddress,
    provider: expectedProvider
  };

  // Validate structure
  if (
    !stateData.businessId ||
    !stateData.emailAddress ||
    !stateData.nonce ||
    !stateData.timestamp
  ) {
    throw new OAuthStateValidationError(
      'Invalid or expired OAuth state parameter',
      ErrorCodes.OAUTH_STATE_VALIDATION_FAILED,
      400,
      extractedMetadata
    );
  }

  // Check timestamp age (10 minute max)
  const stateAge = Date.now() - stateData.timestamp;
  if (stateAge > 10 * 60 * 1000) {
    throw new OAuthStateValidationError(
      'Invalid or expired OAuth state parameter',
      ErrorCodes.OAUTH_STATE_VALIDATION_FAILED,
      400,
      extractedMetadata
    );
  }

  // SECURITY: Atomically verify and claim nonce (prevents CSRF attacks and replay race conditions)
  // Uses DELETE with RETURNING to ensure only one request can successfully claim the nonce
  const nonceResult = await query(
    `DELETE FROM oauth_nonces
     WHERE nonce = $1
       AND business_id = $2
       AND email_address = $3
       AND provider = $4
       AND expires_at > CURRENT_TIMESTAMP
     RETURNING business_id, email_address, provider`,
    [stateData.nonce, stateData.businessId, stateData.emailAddress, expectedProvider]
  );

  // If exactly one row was deleted, nonce was valid and successfully claimed
  // If zero rows, nonce was invalid/expired/mismatched (already deleted or never existed)
  // If multiple rows (shouldn't happen due to PRIMARY KEY), still treat as invalid
  if (nonceResult.rows.length !== 1) {
    oauthLogger.warn('Invalid, expired, or already used OAuth nonce', {
      ...context,
      metadata: {
        nonce: stateData.nonce.substring(0, 10) + '...',
        provider: expectedProvider,
        businessId: stateData.businessId,
        emailAddress: stateData.emailAddress,
        rowsDeleted: nonceResult.rows.length
      }
    });
    throw new OAuthStateValidationError(
      'Invalid or expired OAuth state parameter',
      ErrorCodes.OAUTH_STATE_VALIDATION_FAILED,
      400,
      {
        businessId: stateData.businessId,
        emailAddress: stateData.emailAddress,
        provider: expectedProvider
      }
    );
  }

  oauthLogger.debug('OAuth state validated successfully', {
    ...context,
    businessId: stateData.businessId,
    emailAddress: stateData.emailAddress,
    metadata: { provider: expectedProvider }
  });

  return stateData as OAuthState;
}

