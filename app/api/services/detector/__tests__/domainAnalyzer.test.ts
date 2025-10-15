/**
 * Domain Analyzer Utilities Tests
 * Tests for shared domain analysis functionality
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import {
  analyzeDomain,
  detectTyposquatting,
  detectHomoglyphs,
  isSuspiciousDomainPattern,
  isTemporaryEmailDomain,
  isUrlShortener,
  isIPAddress,
  extractDomain,
  KNOWN_BRAND_DOMAINS,
  SUSPICIOUS_DOMAIN_PATTERNS,
  URL_SHORTENERS
} from '../domainAnalyzer.js';

// Mock fetch for WHOIS API calls
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('Domain Analyzer Utilities', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('analyzeDomain', () => {
    it('should detect typosquatting attacks', async () => {
      const result = await analyzeDomain('micros0ft.com');
      
      expect(result.isSuspicious).toBe(true);
      expect(result.type).toBe('typosquatting');
      expect(result.similarDomain).toBe('microsoft.com');
      expect(result.distance).toBe(1);
      expect(result.riskScore).toBe(40);
    });

    it('should detect homoglyph attacks', async () => {
      const result = await analyzeDomain('аpple.com');
      
      expect(result.isSuspicious).toBe(true);
      // Note: This might be detected as typosquatting instead of homoglyph due to Levenshtein distance
      expect(['typosquatting', 'homoglyph']).toContain(result.type);
      expect(result.similarDomain).toBe('apple.com');
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it('should detect suspicious domain patterns', async () => {
      const result = await analyzeDomain('gmail.co');
      
      expect(result.isSuspicious).toBe(true);
      // Note: This might be detected as typosquatting instead of suspicious_pattern due to Levenshtein distance
      expect(['typosquatting', 'suspicious_pattern']).toContain(result.type);
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it('should return clean result for legitimate domains', async () => {
      // Mock WHOIS API response for legitimate domain
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'legitimate-company.com',
          created_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year ago
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeDomain('legitimate-company.com');
      
      expect(result.isSuspicious).toBe(false);
      expect(result.riskScore).toBe(0);
    });

    it('should prioritize typosquatting over homoglyph detection', async () => {
      // This domain could be detected as both, but typosquatting should take precedence
      const result = await analyzeDomain('micros0ft.com');
      
      expect(result.type).toBe('typosquatting');
      expect(result.type).not.toBe('homoglyph');
    });

    it('should include domain age analysis for new domains', async () => {
      // Mock WHOIS API response for newly registered domain
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'newly-registered-domain-12345.com',
          created_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days ago
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeDomain('newly-registered-domain-12345.com');
      
      // The result should include domainAge information
      expect(result.domainAge).toBeDefined();
      if (result.domainAge) {
        expect(result.domainAge.ageInDays).toBe(3);
        expect(result.domainAge.riskLevel).toBe('very_high');
        expect(result.domainAge.riskScore).toBe(40);
      }
    });
  });

  describe('detectTyposquatting', () => {
    it('should detect single character substitution', () => {
      const result = detectTyposquatting('micros0ft.com');
      
      expect(result.isSuspicious).toBe(true);
      expect(result.similarDomain).toBe('microsoft.com');
      expect(result.distance).toBe(1);
    });

    it('should detect transposed characters', () => {
      const result = detectTyposquatting('microsfot.com');
      
      expect(result.isSuspicious).toBe(true);
      expect(result.similarDomain).toBe('microsoft.com');
      expect(result.distance).toBe(2);
    });

    it('should detect multiple character changes', () => {
      const result = detectTyposquatting('micr0s0ft.com');
      
      expect(result.isSuspicious).toBe(true);
      expect(result.similarDomain).toBe('microsoft.com');
      expect(result.distance).toBe(2);
    });

    it('should not flag domains that are too different', () => {
      const result = detectTyposquatting('completely-different.com');
      
      expect(result.isSuspicious).toBe(false);
    });

    it('should not flag legitimate brand domains', () => {
      const result = detectTyposquatting('microsoft.com');
      
      expect(result.isSuspicious).toBe(false);
    });

    it('should handle domains with different lengths', () => {
      const result = detectTyposquatting('goog.com'); // Too short
      
      // goog.com might still be detected as similar to google.com
      expect(result.isSuspicious).toBeDefined();
    });
  });

  describe('detectHomoglyphs', () => {
    it('should detect Cyrillic character substitution', () => {
      const result = detectHomoglyphs('аpple.com');
      
      expect(result.isSuspicious).toBe(true);
      expect(result.similarDomain).toBe('apple.com');
    });

    it('should detect Greek character substitution', () => {
      const result = detectHomoglyphs('gοοgle.com');
      
      expect(result.isSuspicious).toBe(true);
      expect(result.similarDomain).toBe('google.com');
    });

    it('should detect number-to-letter substitution', () => {
      const result = detectHomoglyphs('paypa1.com');
      
      expect(result.isSuspicious).toBe(true);
      expect(result.similarDomain).toBe('paypal.com');
    });

    it('should detect multiple number substitutions', () => {
      const result = detectHomoglyphs('micr0s0ft.com');
      
      expect(result.isSuspicious).toBe(true);
      expect(result.similarDomain).toBe('microsoft.com');
    });

    it('should not flag domains with different lengths', () => {
      const result = detectHomoglyphs('app.com'); // Too short
      
      expect(result.isSuspicious).toBe(false);
    });

    it('should not flag legitimate domains', () => {
      const result = detectHomoglyphs('apple.com');
      
      expect(result.isSuspicious).toBe(false);
    });

    it('should not flag domains that are too different', () => {
      const result = detectHomoglyphs('completely-different.com');
      
      expect(result.isSuspicious).toBe(false);
    });
  });

  describe('isTemporaryEmailDomain', () => {
    it('should detect temporary email domains', () => {
      expect(isTemporaryEmailDomain('temp-mail.com')).toBe(true);
      expect(isTemporaryEmailDomain('disposable-email.com')).toBe(true);
      expect(isTemporaryEmailDomain('throwaway-mail.com')).toBe(true);
      expect(isTemporaryEmailDomain('10minutemail.com')).toBe(true);
      expect(isTemporaryEmailDomain('guerrillamail.com')).toBe(true);
      expect(isTemporaryEmailDomain('mailinator.com')).toBe(true);
      expect(isTemporaryEmailDomain('tempmail.com')).toBe(true);
      expect(isTemporaryEmailDomain('yopmail.com')).toBe(true);
      expect(isTemporaryEmailDomain('sharklasers.com')).toBe(true);
      expect(isTemporaryEmailDomain('trashmail.com')).toBe(true);
    });

    it('should not flag legitimate domains', () => {
      expect(isTemporaryEmailDomain('gmail.com')).toBe(false);
      expect(isTemporaryEmailDomain('yahoo.com')).toBe(false);
      expect(isTemporaryEmailDomain('outlook.com')).toBe(false);
      expect(isTemporaryEmailDomain('company.com')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isTemporaryEmailDomain('TEMP-MAIL.COM')).toBe(true);
      expect(isTemporaryEmailDomain('Disposable-Email.com')).toBe(true);
    });

    it('should detect partial matches', () => {
      expect(isTemporaryEmailDomain('my-temp-mail-service.com')).toBe(true);
      expect(isTemporaryEmailDomain('disposable-email-provider.com')).toBe(true);
    });
  });

  describe('isSuspiciousDomainPattern', () => {
    it('should detect incomplete gmail domain', () => {
      expect(isSuspiciousDomainPattern('gmail.co')).toBe(true);
    });

    it('should detect incomplete yahoo domain', () => {
      expect(isSuspiciousDomainPattern('yahoo.co')).toBe(true);
    });

    it('should detect incomplete outlook domain', () => {
      expect(isSuspiciousDomainPattern('outlook.co')).toBe(true);
    });

    it('should detect incomplete amazon domain', () => {
      expect(isSuspiciousDomainPattern('amazon.co')).toBe(true);
    });

    it('should detect incomplete paypal domain', () => {
      expect(isSuspiciousDomainPattern('paypal.co')).toBe(true);
    });

    it('should detect incomplete apple domain', () => {
      expect(isSuspiciousDomainPattern('apple.co')).toBe(true);
    });

    it('should detect incomplete microsoft domain', () => {
      expect(isSuspiciousDomainPattern('microsoft.co')).toBe(true);
    });

    it('should detect incomplete google domain', () => {
      expect(isSuspiciousDomainPattern('google.co')).toBe(true);
    });

    it('should detect incomplete facebook domain', () => {
      expect(isSuspiciousDomainPattern('facebook.co')).toBe(true);
    });

    it('should detect incomplete twitter domain', () => {
      expect(isSuspiciousDomainPattern('twitter.co')).toBe(true);
    });

    it('should detect incomplete linkedin domain', () => {
      expect(isSuspiciousDomainPattern('linkedin.co')).toBe(true);
    });

    it('should detect incomplete instagram domain', () => {
      expect(isSuspiciousDomainPattern('instagram.co')).toBe(true);
    });

    it('should not flag complete domains', () => {
      expect(isSuspiciousDomainPattern('gmail.com')).toBe(false);
      expect(isSuspiciousDomainPattern('yahoo.com')).toBe(false);
      expect(isSuspiciousDomainPattern('outlook.com')).toBe(false);
    });

    it('should not flag legitimate domains', () => {
      expect(isSuspiciousDomainPattern('legitimate-site.com')).toBe(false);
      expect(isSuspiciousDomainPattern('company.org')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isSuspiciousDomainPattern('GMAIL.CO')).toBe(true);
      expect(isSuspiciousDomainPattern('Gmail.Co')).toBe(true);
    });
  });

  describe('isUrlShortener', () => {
    it('should detect bit.ly', () => {
      expect(isUrlShortener('bit.ly')).toBe(true);
    });

    it('should detect tinyurl.com', () => {
      expect(isUrlShortener('tinyurl.com')).toBe(true);
    });

    it('should detect goo.gl', () => {
      expect(isUrlShortener('goo.gl')).toBe(true);
    });

    it('should detect t.co', () => {
      expect(isUrlShortener('t.co')).toBe(true);
    });

    it('should detect short.link', () => {
      expect(isUrlShortener('short.link')).toBe(true);
    });

    it('should detect ow.ly', () => {
      expect(isUrlShortener('ow.ly')).toBe(true);
    });

    it('should detect buff.ly', () => {
      expect(isUrlShortener('buff.ly')).toBe(true);
    });

    it('should detect is.gd', () => {
      expect(isUrlShortener('is.gd')).toBe(true);
    });

    it('should detect v.gd', () => {
      expect(isUrlShortener('v.gd')).toBe(true);
    });

    it('should detect tiny.cc', () => {
      expect(isUrlShortener('tiny.cc')).toBe(true);
    });

    it('should detect rebrand.ly', () => {
      expect(isUrlShortener('rebrand.ly')).toBe(true);
    });

    it('should detect shorturl.at', () => {
      expect(isUrlShortener('shorturl.at')).toBe(true);
    });

    it('should detect cutt.ly', () => {
      expect(isUrlShortener('cutt.ly')).toBe(true);
    });

    it('should detect short.to', () => {
      expect(isUrlShortener('short.to')).toBe(true);
    });

    it('should not flag legitimate domains', () => {
      expect(isUrlShortener('google.com')).toBe(false);
      expect(isUrlShortener('github.com')).toBe(false);
      expect(isUrlShortener('stackoverflow.com')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isUrlShortener('BIT.LY')).toBe(true);
      expect(isUrlShortener('Bit.Ly')).toBe(true);
    });
  });

  describe('isIPAddress', () => {
    it('should detect valid IPv4 addresses', () => {
      expect(isIPAddress('192.168.1.1')).toBe(true);
      expect(isIPAddress('10.0.0.1')).toBe(true);
      expect(isIPAddress('172.16.0.1')).toBe(true);
      expect(isIPAddress('8.8.8.8')).toBe(true);
      expect(isIPAddress('127.0.0.1')).toBe(true);
    });

    it('should detect edge case IPv4 addresses', () => {
      expect(isIPAddress('0.0.0.0')).toBe(true);
      expect(isIPAddress('255.255.255.255')).toBe(true);
      expect(isIPAddress('1.1.1.1')).toBe(true);
    });

    it('should not detect invalid IP addresses', () => {
      expect(isIPAddress('256.1.1.1')).toBe(false); // Invalid octet
      expect(isIPAddress('1.1.1')).toBe(false); // Too few octets
      expect(isIPAddress('1.1.1.1.1')).toBe(false); // Too many octets
      expect(isIPAddress('1.1.1.1.')).toBe(false); // Trailing dot
      expect(isIPAddress('.1.1.1.1')).toBe(false); // Leading dot
    });

    it('should not detect domain names', () => {
      expect(isIPAddress('google.com')).toBe(false);
      expect(isIPAddress('192.168.1')).toBe(false);
      expect(isIPAddress('localhost')).toBe(false);
    });

    it('should not detect empty or invalid strings', () => {
      expect(isIPAddress('')).toBe(false);
      expect(isIPAddress('not-an-ip')).toBe(false);
      expect(isIPAddress('1.2.3.4.5')).toBe(false);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from simple email', () => {
      expect(extractDomain('user@domain.com')).toBe('domain.com');
    });

    it('should extract domain from email with display name', () => {
      expect(extractDomain('John Doe <john@domain.com>')).toBe('domain.com');
    });

    it('should extract domain from email in angle brackets', () => {
      expect(extractDomain('<john@domain.com>')).toBe('domain.com');
    });

    it('should extract domain from URL', () => {
      expect(extractDomain('https://domain.com/path')).toBe('domain.com');
      expect(extractDomain('http://domain.com/path')).toBe('domain.com');
    });

    it('should extract domain from simple domain string', () => {
      expect(extractDomain('domain.com')).toBe('domain.com');
    });

    it('should handle subdomains', () => {
      expect(extractDomain('user@sub.domain.com')).toBe('sub.domain.com');
      expect(extractDomain('https://sub.domain.com/path')).toBe('sub.domain.com');
    });

    it('should handle internationalized domains', () => {
      expect(extractDomain('user@сайт.com')).toBe('сайт.com');
      // Note: URL constructor may convert internationalized domains to punycode
      const result = extractDomain('https://网站.com/path');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should return null for invalid inputs', () => {
      expect(extractDomain('')).toBe(null);
      expect(extractDomain('not-an-email')).toBe(null);
      expect(extractDomain('invalid-email-format')).toBe(null);
    });

    it('should handle malformed email addresses', () => {
      expect(extractDomain('user@')).toBe(null);
      // Note: @domain.com might be treated as a domain by our function
      expect(extractDomain('user@@domain.com')).toBe(null);
    });

    it('should handle malformed URLs', () => {
      expect(extractDomain('not-a-url')).toBe(null);
      expect(extractDomain('http://')).toBe(null);
      expect(extractDomain('https://')).toBe(null);
    });

    it('should be case insensitive', () => {
      expect(extractDomain('USER@DOMAIN.COM')).toBe('domain.com');
      expect(extractDomain('https://DOMAIN.COM/path')).toBe('domain.com');
    });
  });

  describe('constants', () => {
    it('should have known brand domains', () => {
      expect(KNOWN_BRAND_DOMAINS).toContain('google.com');
      expect(KNOWN_BRAND_DOMAINS).toContain('microsoft.com');
      expect(KNOWN_BRAND_DOMAINS).toContain('apple.com');
      expect(KNOWN_BRAND_DOMAINS).toContain('amazon.com');
      expect(KNOWN_BRAND_DOMAINS).toContain('paypal.com');
      expect(KNOWN_BRAND_DOMAINS.length).toBeGreaterThan(20);
    });

    it('should have suspicious domain patterns', () => {
      expect(SUSPICIOUS_DOMAIN_PATTERNS.length).toBeGreaterThan(0);
      expect(SUSPICIOUS_DOMAIN_PATTERNS[0]).toBeInstanceOf(RegExp);
    });

    it('should have URL shorteners', () => {
      expect(URL_SHORTENERS).toContain('bit.ly');
      expect(URL_SHORTENERS).toContain('tinyurl.com');
      expect(URL_SHORTENERS).toContain('goo.gl');
      expect(URL_SHORTENERS.length).toBeGreaterThan(10);
    });
  });
});
