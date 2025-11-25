/**
 * Email Monitor Service Tests
 * Tests the email monitoring functionality including own service filtering
 */
import { describe, expect, it } from '@jest/globals';
import { extractEmailAddress, isFromOwnService } from '../../utils/emailUtils.js';

describe('EmailMonitor', () => {
  describe('isFromOwnService', () => {

    it('should identify localhost emails as from own service', () => {
      expect(isFromOwnService('noreply@localhost')).toBe(true);
      expect(isFromOwnService('admin@localhost')).toBe(true);
    });

    it('should identify 127.0.0.1 emails as from own service', () => {
      expect(isFromOwnService('noreply@127.0.0.1')).toBe(true);
      expect(isFromOwnService('admin@127.0.0.1')).toBe(true);
    });

    it('should identify 0.0.0.0 emails as from own service', () => {
      expect(isFromOwnService('noreply@0.0.0.0')).toBe(true);
    });

    it('should identify ::1 emails as from own service', () => {
      expect(isFromOwnService('noreply@::1')).toBe(true);
    });

    it('should identify subdomain emails as from own service', () => {
      expect(isFromOwnService('noreply@mail.localhost')).toBe(true);
      expect(isFromOwnService('admin@internal.127.0.0.1')).toBe(true);
    });

    it('should handle display name format correctly', () => {
      const emailAddress = extractEmailAddress('Dylan Keen <dylan.keen@numenorsecurity.com>');
      expect(isFromOwnService(emailAddress)).toBe(true);
      const localAddress = extractEmailAddress('Admin <admin@localhost>');
      expect(isFromOwnService(localAddress)).toBe(true);
    });

    it('should reject domain spoofing attempts', () => {
      expect(isFromOwnService('evil-numenorsecurity.com')).toBe(false);
      expect(isFromOwnService('fake.numenorsecurity.com.evil.com')).toBe(false);
      expect(isFromOwnService('sub.mail.numenorsecurity.com')).toBe(false);
    });

    it('should reject invalid email formats', () => {
      expect(isFromOwnService('not-an-email')).toBe(false);
      expect(isFromOwnService('invalid@')).toBe(false);
      expect(isFromOwnService('@domain.com')).toBe(false);
    });

    it('should reject excessively long inputs', () => {
      expect(isFromOwnService('a'.repeat(1001))).toBe(false);
    });

    it('should not identify external emails as from own service', () => {
      expect(isFromOwnService('noreply@example.com')).toBe(false);
      expect(isFromOwnService('admin@google.com')).toBe(false);
      expect(isFromOwnService('user@amazon.com')).toBe(false);
    });

    it('should handle invalid email formats', () => {
      expect(isFromOwnService('')).toBe(false);
      expect(isFromOwnService('invalid-email')).toBe(false);
      expect(isFromOwnService('@localhost')).toBe(false);
      expect(isFromOwnService('user@')).toBe(false);
    });

    it('should handle null/undefined inputs', () => {
      expect(isFromOwnService(null as any)).toBe(false);
      expect(isFromOwnService(undefined as any)).toBe(false);
    });
  });
});
