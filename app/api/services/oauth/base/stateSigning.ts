/**
 * OAuth State Signing Utilities
 * HMAC-SHA256 signing for OAuth state parameter and Microsoft Graph clientState to prevent tampering
 */

import crypto from 'node:crypto';
import type { OAuthState } from './types.js';

// Get HMAC secret from environment
const HMAC_SECRET = process.env.JWT_SECRET || '';

// SECURITY: Fail fast if secret is missing (prevents insecure HMAC signatures)
if (!HMAC_SECRET) {
  throw new Error(
    'JWT_SECRET must be configured. ' +
    'HMAC signing requires a secret to prevent tampering.'
  );
}

/**
 * Sign OAuth state with HMAC-SHA256
 * Creates a signed token that prevents tampering with businessId/emailAddress
 * Format: base64url(JSON) + '.' + base64url(HMAC-SHA256)
 * 
 * @param state - OAuth state object to sign
 * @returns Signed state string (URL-safe)
 */
export function signOAuthState(state: OAuthState): string {
  const payload = JSON.stringify(state);
  const payloadBase64 = Buffer.from(payload).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(payload)
    .digest('base64url');
  
  return `${payloadBase64}.${signature}`;
}

/**
 * Verify and parse signed OAuth state
 * Returns null if signature is invalid (prevents state tampering)
 * 
 * @param signedState - Signed state string from OAuth callback
 * @returns Parsed OAuth state or null if invalid
 */
export function verifyOAuthState(signedState: string): OAuthState | null {
  if (!signedState) {
    return null;
  }

  const parts = signedState.split('.');
  if (parts.length !== 2) {
    return null; // Invalid format
  }

  const [payloadBase64, signature] = parts;

  try {
    // Decode payload
    const payload = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
    const state = JSON.parse(payload) as OAuthState;

    // Verify signature using timing-safe comparison
    const expectedSignature = crypto
      .createHmac('sha256', HMAC_SECRET)
      .update(payload)
      .digest('base64url');

    // Use timing-safe comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null; // Invalid signature - state was tampered with
    }

    return state;
  } catch {
    return null; // Invalid JSON or base64 encoding
  }
}

/**
 * Sign Microsoft Graph clientState with HMAC-SHA256
 * Format: {businessId}:{emailAddress}:{signature}
 * This prevents tampering with business/email association in webhooks
 * Uses base64url encoding for shorter, URL-safe signatures
 * 
 * @param businessId - Business ID
 * @param emailAddress - Email address
 * @returns Signed clientState string
 */
export function signClientState(businessId: number, emailAddress: string): string {
  const payload = `${businessId}:${emailAddress}`;
  const signature = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}:${signature}`;
}

/**
 * Verify and extract businessId/emailAddress from signed clientState
 * Returns null if signature is invalid (prevents webhook spoofing)
 * 
 * @param clientState - Signed clientState string from Microsoft Graph webhook
 * @returns Parsed businessId and emailAddress or null if invalid
 */
export function verifyClientState(clientState: string): { businessId: number; emailAddress: string } | null {
  if (!clientState) {
    return null;
  }

  const parts = clientState.split(':');
  if (parts.length !== 3) {
    return null; // Invalid format
  }

  const [businessIdStr, emailAddress, signature] = parts;
  const businessId = parseInt(businessIdStr, 10);

  if (isNaN(businessId) || !emailAddress || !signature) {
    return null;
  }

  // Verify signature using timing-safe comparison
  const payload = `${businessId}:${emailAddress}`;
  const expectedSignature = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(payload)
    .digest('base64url');

  // Use timing-safe comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null; // Invalid signature
  }

  return { businessId, emailAddress };
}

