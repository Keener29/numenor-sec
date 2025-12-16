/**
 * ClientState Signing Utilities
 * HMAC-SHA256 signing for Microsoft Graph webhook security
 */

import crypto from 'node:crypto';

// Get HMAC secret from environment (fallback to JWT_SECRET for MVP)
const CLIENT_STATE_SECRET = process.env.MICROSOFT_CLIENT_STATE_SECRET || process.env.JWT_SECRET || '';

// SECURITY: Fail fast if secret is missing (prevents insecure HMAC signatures)
if (!CLIENT_STATE_SECRET) {
  throw new Error(
    'MICROSOFT_CLIENT_STATE_SECRET or JWT_SECRET must be configured. ' +
    'ClientState signing requires a secret to prevent webhook spoofing.'
  );
}

/**
 * Sign clientState with HMAC-SHA256 for security
 * Format: {businessId}:{emailAddress}:{signature}
 * This prevents tampering with business/email association in webhooks
 * Uses base64url encoding for shorter, URL-safe signatures
 */
export function signClientState(businessId: number, emailAddress: string): string {
  const payload = `${businessId}:${emailAddress}`;
  const signature = crypto
    .createHmac('sha256', CLIENT_STATE_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}:${signature}`;
}

/**
 * Verify and extract businessId/emailAddress from signed clientState
 * Returns null if signature is invalid (prevents webhook spoofing)
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
    .createHmac('sha256', CLIENT_STATE_SECRET)
    .update(payload)
    .digest('base64url');

  // Use timing-safe comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null; // Invalid signature
  }

  return { businessId, emailAddress };
}

