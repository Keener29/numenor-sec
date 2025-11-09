/**
 * Domain Age Analyzer Tests
 * Tests for domain age analysis functionality
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import {
  analyzeDomainAge,
  analyzeSenderDomainAge,
  clearDomainAgeCache,
  getCacheStats,
  type DomainAgeResult
} from '../domainAgeAnalyzer.js';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('Domain Age Analyzer', () => {
  beforeEach(() => {
    clearDomainAgeCache();
    mockFetch.mockReset();
  });

  describe('analyzeDomainAge', () => {
    it('should return very high risk for domains < 7 days old', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'brandnew.com',
          created_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days ago
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeDomainAge('brandnew.com');

      expect(result.isSuspicious).toBe(true);
      expect(result.riskLevel).toBe('very_high');
      expect(result.riskScore).toBe(40);
      expect(result.ageInDays).toBe(3);
      expect(result.registrationDate).toBeInstanceOf(Date);
    });

    it('should return high risk for domains 7-30 days old', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'newdomain.com',
          created_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() // 15 days ago
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeDomainAge('newdomain.com');

      expect(result.isSuspicious).toBe(true);
      expect(result.riskLevel).toBe('high');
      expect(result.riskScore).toBe(20);
      expect(result.ageInDays).toBe(15);
      expect(result.registrationDate).toBeInstanceOf(Date);
    });

    it('should return low risk for domains 30+ days old', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'olddomain.com',
          created_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days ago
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeDomainAge('olddomain.com');

      expect(result.isSuspicious).toBe(false);
      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBe(0);
      expect(result.ageInDays).toBe(90);
    });

    it('should return low risk for domains 180+ days old', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'olddomain.com',
          created_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year ago
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeDomainAge('olddomain.com');

      expect(result.isSuspicious).toBe(false);
      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBe(0);
      expect(result.ageInDays).toBe(365);
    });

    it('should handle trusted domains without WHOIS lookup', async () => {
      const result = await analyzeDomainAge('gmail.com');

      expect(result.isSuspicious).toBe(false);
      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBe(0);
      expect(result.ageInDays).toBe(null);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle WHOIS API failures gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      const result = await analyzeDomainAge('failing-domain.com');

      expect(result.isSuspicious).toBe(false);
      expect(result.riskLevel).toBe('unknown');
      expect(result.riskScore).toBe(0);
      expect(result.ageInDays).toBe(null);
      expect(result.error).toBe('WHOIS lookup failed');
    });

    it('should handle invalid domain formats', async () => {
      const result = await analyzeDomainAge('invalid-domain');

      expect(result.isSuspicious).toBe(true);
      expect(result.riskLevel).toBe('high');
      expect(result.riskScore).toBe(40);
      expect(result.ageInDays).toBe(null);
      expect(result.error).toBe('Invalid domain format');
    });

    it('should clean domain names properly', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'cleaneddomain.com',
          created_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        })
      };
      
      // Test various domain formats - each needs its own mock response
      const testCases = [
        'https://www.cleaneddomain.com/path?query=1',
        'http://cleaneddomain.com:8080/path',
        'www.cleaneddomain.com',
        'cleaneddomain.com'
      ];

      // Set up mock responses for each test case
      testCases.forEach(() => {
        mockFetch.mockResolvedValueOnce(mockResponse as Response);
      });

      for (const testDomain of testCases) {
        const result = await analyzeDomainAge(testDomain);
        expect(result.isSuspicious).toBe(true);
        expect(result.riskLevel).toBe('high');
      }
    });

    it('should parse various date formats', async () => {
      const dateFormats = [
        '2024-01-01', // ISO format
        '01/01/2024', // MM/DD/YYYY
        '01-01-2024', // MM-DD-YYYY
        '2024/01/01'  // YYYY/MM/DD
      ];

      for (const dateFormat of dateFormats) {
        const mockResponse = {
          ok: true,
          json: async () => ({
            domain: 'dateformat.com',
            created_date: dateFormat
          })
        };
        mockFetch.mockResolvedValueOnce(mockResponse as Response);

        const result = await analyzeDomainAge('dateformat.com');
        expect(result.registrationDate).toBeInstanceOf(Date);
        expect(result.ageInDays).toBeGreaterThan(0);
      }
    });

    it('should handle malformed date strings', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'malformeddate.com',
          created_date: 'not-a-date'
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeDomainAge('malformeddate.com');

      expect(result.isSuspicious).toBe(false);
      expect(result.riskLevel).toBe('unknown');
      expect(result.registrationDate).toBe(null);
      expect(result.error).toBe('Could not parse registration date');
    });

    it('should try multiple WHOIS APIs on failure', async () => {
      // First API fails
      mockFetch.mockRejectedValueOnce(new Error('First API failed'));
      // Second API succeeds
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'fallbackdomain.com',
          created_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeDomainAge('fallbackdomain.com');

      expect(result.isSuspicious).toBe(true);
      expect(result.riskLevel).toBe('very_high');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('analyzeSenderDomainAge', () => {
    it('should return medium risk for sender domains < 30 days old', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'newsender.com',
          created_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() // 15 days ago
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeSenderDomainAge('newsender.com');

      expect(result.isSuspicious).toBe(true);
      expect(result.riskLevel).toBe('medium');
      expect(result.riskScore).toBe(20);
      expect(result.ageInDays).toBe(15);
      expect(result.registrationDate).toBeInstanceOf(Date);
    });

    it('should return low risk for sender domains 30+ days old', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'oldsender.com',
          created_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days ago
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeSenderDomainAge('oldsender.com');

      expect(result.isSuspicious).toBe(false);
      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBe(0);
      expect(result.ageInDays).toBe(60);
    });

    it('should handle trusted domains without WHOIS lookup', async () => {
      const result = await analyzeSenderDomainAge('gmail.com');

      expect(result.isSuspicious).toBe(false);
      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBe(0);
      expect(result.ageInDays).toBe(null);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use cached results and adjust scoring', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'cachedsender.com',
          created_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      // First call - should cache the result
      const result1 = await analyzeSenderDomainAge('cachedsender.com');
      expect(result1.isSuspicious).toBe(true);
      expect(result1.riskLevel).toBe('medium');
      expect(result1.riskScore).toBe(20);

      // Second call - should use cache and adjust scoring
      const result2 = await analyzeSenderDomainAge('cachedsender.com');
      expect(result2.isSuspicious).toBe(true);
      expect(result2.riskLevel).toBe('medium');
      expect(result2.riskScore).toBe(20);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, not 2
    });
  });

  describe('caching', () => {
    it('should cache results and return cached data on subsequent calls', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'cacheddomain.com',
          created_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      // First call
      const result1 = await analyzeDomainAge('cacheddomain.com');
      expect(result1.isSuspicious).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await analyzeDomainAge('cacheddomain.com');
      expect(result2.isSuspicious).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, not 2

      // Results should be identical
      expect(result1.ageInDays).toBe(result2.ageInDays);
      expect(result1.riskLevel).toBe(result2.riskLevel);
    });

    it('should provide cache statistics', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'statsdomain.com',
          created_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      await analyzeDomainAge('statsdomain.com');

      const stats = getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries).toContain('statsdomain.com');
    });

    it('should clear cache when requested', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'cleardomain.com',
          created_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      await analyzeDomainAge('cleardomain.com');
      expect(getCacheStats().size).toBe(1);

      clearDomainAgeCache();
      expect(getCacheStats().size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty domain string', async () => {
      const result = await analyzeDomainAge('');

      expect(result.isSuspicious).toBe(true);
      expect(result.riskLevel).toBe('high');
      expect(result.riskScore).toBe(40);
      expect(result.error).toBe('Invalid domain format');
    });

    it('should handle null/undefined domain', async () => {
      const result = await analyzeDomainAge(null as any);

      expect(result.isSuspicious).toBe(true);
      expect(result.riskLevel).toBe('high');
      expect(result.riskScore).toBe(40);
      expect(result.error).toBe('Invalid domain format');
    });

    it('should handle domains with special characters', async () => {
      const result = await analyzeDomainAge('domain-with-dashes.com');

      // Should not throw error, but may fail WHOIS lookup
      expect(result).toBeDefined();
      expect(typeof result.isSuspicious).toBe('boolean');
    });

    it('should handle internationalized domains', async () => {
      const result = await analyzeDomainAge('сайт.com');

      // Should not throw error
      expect(result).toBeDefined();
      expect(typeof result.isSuspicious).toBe('boolean');
    });

    it('should handle very long domain names', async () => {
      const longDomain = 'a'.repeat(100) + '.com';
      const result = await analyzeDomainAge(longDomain);

      // Should not throw error
      expect(result).toBeDefined();
      expect(typeof result.isSuspicious).toBe('boolean');
    });
  });

  describe('risk scoring accuracy', () => {
    it('should score exactly 30 days as low risk', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'exactly30days.com',
          created_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeDomainAge('exactly30days.com');

      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBe(0);
      expect(result.ageInDays).toBe(30);
    });

    it('should score exactly 7 days as high risk', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'exactly7days.com',
          created_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeDomainAge('exactly7days.com');

      expect(result.riskLevel).toBe('high');
      expect(result.riskScore).toBe(20);
      expect(result.ageInDays).toBe(7);
    });

    it('should score 0 days as very high risk', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          domain: 'brandnew.com',
          created_date: new Date().toISOString() // Today
        })
      };
      mockFetch.mockResolvedValueOnce(mockResponse as Response);

      const result = await analyzeDomainAge('brandnew.com');

      expect(result.riskLevel).toBe('very_high');
      expect(result.riskScore).toBe(40);
      expect(result.ageInDays).toBe(0);
    });
  });
});
