/**
 * OAuth Token Encryption Utility
 * Encrypts and decrypts OAuth tokens before storing/retrieving from database
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto';
import { oauthLogger } from '../../utils/logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const AUTH_TAG_LENGTH = 16; // 16 bytes for GCM authentication tag
const SALT_LENGTH = 64; // 64 bytes for key derivation salt

/**
 * Get encryption key from environment variable
 * Falls back to a warning if not set (for development)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  
  if (!key) {
    oauthLogger.error('OAUTH_TOKEN_ENCRYPTION_KEY environment variable is not set', {
      operation: 'token-encryption',
      metadata: { 
        warning: 'Tokens will be stored unencrypted. Set OAUTH_TOKEN_ENCRYPTION_KEY for production.' 
      }
    });
    // For development: generate a key from a default value (NOT SECURE FOR PRODUCTION)
    // In production, this should throw an error
    if (process.env.NODE_ENV === 'production') {
      throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY must be set in production environment');
    }
    // Development fallback: derive key from a default string (NOT SECURE)
    return crypto.pbkdf2Sync('default-dev-key-change-in-production', 'salt', 100000, 32, 'sha256');
  }

  // Key should be 32 bytes (256 bits) for AES-256
  // If provided as hex string, decode it; otherwise use directly
  if (key.length === 64) {
    // Assume hex string
    return Buffer.from(key, 'hex');
  } else if (key.length === 32) {
    // Assume raw bytes
    return Buffer.from(key);
  } else {
    // Derive key using PBKDF2
    return crypto.pbkdf2Sync(key, 'oauth-token-salt', 100000, 32, 'sha256');
  }
}

/**
 * Encrypt a token string
 * Returns base64-encoded string: IV + AuthTag + EncryptedData
 */
export function encryptToken(token: string): string {
  if (!token) {
    return token;
  }

  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(token, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();

    // Combine IV + AuthTag + EncryptedData
    // Format: base64(IV + AuthTag + EncryptedData)
    const combined = Buffer.concat([
      iv,
      authTag,
      Buffer.from(encrypted, 'base64')
    ]);

    return combined.toString('base64');
  } catch (error) {
    oauthLogger.error('Failed to encrypt token', {
      operation: 'encrypt-token'
    }, error as Error);
    throw new Error('Failed to encrypt OAuth token');
  }
}

/**
 * Decrypt a token string
 * Expects base64-encoded string: IV + AuthTag + EncryptedData
 */
export function decryptToken(encryptedToken: string): string {
  if (!encryptedToken) {
    return encryptedToken;
  }

  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedToken, 'base64');

    // Extract IV, AuthTag, and EncryptedData
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encryptedData = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    oauthLogger.error('Failed to decrypt token', {
      operation: 'decrypt-token'
    }, error as Error);
    
    // If decryption fails, it might be an old unencrypted token
    // Try to return as-is (for backward compatibility during migration)
    // Log a warning so we know this happened
    oauthLogger.warn('Token decryption failed - may be unencrypted legacy token', {
      operation: 'decrypt-token',
      metadata: { 
        note: 'This may indicate a token stored before encryption was implemented' 
      }
    });
    
    // Return the token as-is (might be unencrypted)
    // In production, you might want to throw an error instead
    return encryptedToken;
  }
}

/**
 * Check if a string appears to be encrypted (has the expected structure)
 */
export function isEncrypted(token: string): boolean {
  if (!token) {
    return false;
  }

  try {
    const combined = Buffer.from(token, 'base64');
    // Encrypted tokens should have at least IV + AuthTag + some data
    return combined.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}
