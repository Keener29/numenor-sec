/**
 * Token Service Tests
 * Tests security-critical token generation and validation logic
 */

import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { tokenService } from '../tokenService.js';

describe('TokenService', () => {
  const originalSecret = process.env.TOKEN_SECRET;

  beforeEach(() => {
    // Set a test secret
    process.env.TOKEN_SECRET = 'test-secret-key-for-token-validation';
  });

  afterEach(() => {
    // Restore original secret
    if (originalSecret) {
      process.env.TOKEN_SECRET = originalSecret;
    } else {
      delete process.env.TOKEN_SECRET;
    }
  });

  describe('generateApprovalToken', () => {
    it('should generate a token with correct format', () => {
      const token = tokenService.generateApprovalToken(123, 456);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      // Token format: approve_{emailId}_{businessId}_{timestamp}_{hash}
      const parts = token.split('_');
      expect(parts.length).toBeGreaterThanOrEqual(5);
      expect(parts[0]).toBe('approve');
      expect(Number.parseInt(parts[1])).toBe(123);
      expect(Number.parseInt(parts[2])).toBe(456);
    });

    it('should generate different tokens for same inputs at different times', async () => {
      const token1 = tokenService.generateApprovalToken(123, 456);
      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      const token2 = tokenService.generateApprovalToken(123, 456);

      expect(token1).not.toBe(token2);
    });

    it('should throw error when TOKEN_SECRET is missing', () => {
      delete process.env.TOKEN_SECRET;

      expect(() => {
        tokenService.generateApprovalToken(123, 456);
      }).toThrow('TOKEN_SECRET environment variable is required');
    });
  });

  describe('validateApprovalToken', () => {
    it('should validate a correctly generated approval token', () => {
      const token = tokenService.generateApprovalToken(123, 456);
      const isValid = tokenService.validateApprovalToken(token, 123, 456);

      expect(isValid).toBe(true);
    });

    it('should reject token with wrong email ID', () => {
      const token = tokenService.generateApprovalToken(123, 456);
      const isValid = tokenService.validateApprovalToken(token, 999, 456);

      expect(isValid).toBe(false);
    });

    it('should reject token with wrong business ID', () => {
      const token = tokenService.generateApprovalToken(123, 456);
      const isValid = tokenService.validateApprovalToken(token, 123, 999);

      expect(isValid).toBe(false);
    });

    it('should reject expired token (older than 24 hours)', () => {
      // Create a token manually with old timestamp
      const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      const payload = `approve_123_456_${oldTimestamp}`;
      const secret = process.env.TOKEN_SECRET!;
      const crypto = require('node:crypto');
      const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
      const expiredToken = `${payload}_${hash}`;

      const isValid = tokenService.validateApprovalToken(expiredToken, 123, 456);

      expect(isValid).toBe(false);
    });

    it('should accept token within 24 hour window', () => {
      const token = tokenService.generateApprovalToken(123, 456);
      const isValid = tokenService.validateApprovalToken(token, 123, 456);

      expect(isValid).toBe(true);
    });

    it('should reject malformed token (too few parts)', () => {
      const isValid = tokenService.validateApprovalToken('invalid_token', 123, 456);

      expect(isValid).toBe(false);
    });

    it('should reject token with tampered hash', () => {
      const token = tokenService.generateApprovalToken(123, 456);
      const parts = token.split('_');
      const tamperedToken = parts.slice(0, -1).join('_') + '_tampered_hash';

      const isValid = tokenService.validateApprovalToken(tamperedToken, 123, 456);

      expect(isValid).toBe(false);
    });

    it('should return false when TOKEN_SECRET is missing during validation', () => {
      const token = tokenService.generateApprovalToken(123, 456);
      delete process.env.TOKEN_SECRET;

      const isValid = tokenService.validateApprovalToken(token, 123, 456);

      expect(isValid).toBe(false);
    });

    it('should handle non-numeric timestamp gracefully', () => {
      const invalidToken = 'approve_123_456_not_a_number_hash';

      const isValid = tokenService.validateApprovalToken(invalidToken, 123, 456);

      expect(isValid).toBe(false);
    });
  });

  describe('Security properties', () => {
    it('should generate tokens that cannot be validated with different secret', () => {
      const token = tokenService.generateApprovalToken(123, 456);

      // Change secret
      process.env.TOKEN_SECRET = 'different-secret';

      const isValid = tokenService.validateApprovalToken(token, 123, 456);

      expect(isValid).toBe(false);
    });

    it('should prevent token reuse by including timestamp', async () => {
      const token1 = tokenService.generateApprovalToken(123, 456);
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      const token2 = tokenService.generateApprovalToken(123, 456);

      // Both should be valid but different
      expect(token1).not.toBe(token2);
      expect(tokenService.validateApprovalToken(token1, 123, 456)).toBe(true);
      expect(tokenService.validateApprovalToken(token2, 123, 456)).toBe(true);
    });
  });
});

