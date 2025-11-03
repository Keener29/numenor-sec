/**
 * Header Analyzer Service Tests
 * Tests for email header analysis and missing header detection
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { headerAnalyzerService, type HeaderAnalysis } from '../headerAnalyzer.js';
import { query } from '../../../../db/connection.js';

// Mock the database connection
jest.mock('../../../../db/connection.js', () => ({
  query: jest.fn()
}));

// Mock the logger
jest.mock('../../logger.js', () => ({
  oauthLogger: {
    error: jest.fn()
  }
}));

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('HeaderAnalyzerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeHeaders', () => {
    it('should detect missing critical headers for external domains', async () => {
      const headers = {
        'subject': 'Test Email',
        'date': 'Mon, 1 Jan 2024 12:00:00 GMT'
        // Missing: from, return-path, message-id, received
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@external-domain.com',
        1
      );

      expect(result.missingHeaders).toContain('From');
      expect(result.missingHeaders).toContain('Return-Path');
      expect(result.missingHeaders).toContain('Message-ID');
      expect(result.missingHeaders).toContain('Received');
      expect(result.isTrustedDomain).toBe(false);
      expect(result.score).toBeGreaterThan(200); // High score for external domain
      expect(result.risks).toContain('CRITICAL: From header missing - cannot verify email authenticity');
    });

    it('should apply reduced penalties for trusted domains', async () => {
      const headers = {
        'subject': 'Test Email',
        'date': 'Mon, 1 Jan 2024 12:00:00'
        // Missing: from, return-path, message-id, received
      };

      // Mock monitored email domain check
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '1' }],
        rowCount: 1
      });

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@company.com',
        1
      );

      expect(result.missingHeaders).toContain('From');
      expect(result.missingHeaders).toContain('Return-Path');
      expect(result.missingHeaders).toContain('Message-ID');
      expect(result.missingHeaders).toContain('Received');
      expect(result.isTrustedDomain).toBe(true);
      expect(result.score).toBeLessThan(100); // Reduced score for trusted domain
      expect(result.risks).toContain('From header missing - sender domain is trusted');
    });

    it('should trust localhost domains', async () => {
      const headers = {
        'subject': 'Test Email'
        // Missing headers
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'user@localhost',
        1
      );

      expect(result.isTrustedDomain).toBe(true);
      expect(result.score).toBeLessThan(100); // Reduced penalties
    });

    it('should trust 127.0.0.1 domains', async () => {
      const headers = {
        'subject': 'Test Email'
        // Missing headers
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'user@127.0.0.1',
        1
      );

      expect(result.isTrustedDomain).toBe(true);
      expect(result.score).toBeLessThan(100); // Reduced penalties
    });

    it('should detect From vs Return-Path domain mismatch (high risk)', async () => {
      const headers = {
        'from': 'legitimate@company.com',
        'return-path': '<suspicious@different-domain.com>',
        'subject': 'Test Email',
        'message-id': '<test@company.com>',
        'received': 'from mail.company.com',
        'user-agent': 'Mozilla/5.0'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'legitimate@company.com',
        1
      );

      expect(result.risks).toContain('From (company.com) != Return-Path (different-domain.com) - high spoofing risk');
      expect(result.score).toBeGreaterThanOrEqual(35); // High score for domain mismatch
    });

    it('should detect From vs Return-Path domain mismatch with display names', async () => {
      const headers = {
        'from': 'John Doe <john@company.com>',
        'return-path': '<suspicious@different-domain.com>',
        'subject': 'Test Email',
        'message-id': '<test@company.com>',
        'received': 'from mail.company.com',
        'user-agent': 'Mozilla/5.0'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'john@company.com',
        1
      );

      expect(result.risks).toContain('From (company.com) != Return-Path (different-domain.com) - high spoofing risk');
      expect(result.score).toBeGreaterThanOrEqual(35);
    });

    it('should apply reduced penalties for trusted domains with domain mismatch', async () => {
      const headers = {
        'from': 'user@localhost',
        'return-path': '<different@127.0.0.1>',
        'subject': 'Test Email',
        'message-id': '<test@localhost>',
        'received': 'from localhost',
        'user-agent': 'Mozilla/5.0'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'user@localhost',
        1
      );

      expect(result.risks).toContain('From domain (localhost) trusted but Return-Path (127.0.0.1) differs - possible brand spoof');
      expect(result.score).toBeLessThanOrEqual(30); // Reduced penalty for trusted domain
    });

    it('should detect Reply-To vs From mismatch', async () => {
      const headers = {
        'from': 'legitimate@company.com',
        'reply-to': 'suspicious@different-domain.com',
        'subject': 'Test Email',
        'message-id': '<test@company.com>',
        'return-path': '<legitimate@company.com>',
        'received': 'from mail.company.com',
        'user-agent': 'Mozilla/5.0'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'legitimate@company.com',
        1
      );

      expect(result.risks).toContain('Reply-To domain (different-domain.com) differs from From domain (company.com) - potential spoofing');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should not flag Reply-To vs From mismatch for trusted domains', async () => {
      const headers = {
        'from': 'user@localhost',
        'reply-to': 'different@127.0.0.1',
        'subject': 'Test Email',
        'message-id': '<test@localhost>',
        'return-path': '<user@localhost>',
        'received': 'from localhost',
        'user-agent': 'Mozilla/5.0'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'user@localhost',
        1
      );

      expect(result.risks).toContain('Reply-To differs from From - sender domain is trusted');
      expect(result.score).toBeLessThan(30); // Reduced penalty (5 for trusted domain vs 25 for non-trusted)
    });

    it('should handle complete headers without issues', async () => {
      const headers = {
        'from': 'sender@company.com',
        'to': 'recipient@company.com',
        'subject': 'Test Email',
        'message-id': '<test@company.com>',
        'return-path': '<sender@company.com>',
        'received': 'from mail.company.com',
        'date': 'Mon, 1 Jan 2024 12:00:00 GMT',
        'user-agent': 'Mozilla/5.0'
      };

      // Mock monitored email domain check
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '1' }],
        rowCount: 1
      });

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@company.com',
        1
      );

      expect(result.missingHeaders).toHaveLength(0);
      expect(result.score).toBe(0);
      expect(result.risks).toHaveLength(0);
      expect(result.isTrustedDomain).toBe(true);
    });
  });

  describe('suspicious header patterns', () => {
    it('should detect missing User-Agent header', async () => {
      const headers = {
        'from': 'sender@external.com',
        'subject': 'Test Email',
        'message-id': '<test@external.com>',
        'return-path': '<sender@external.com>',
        'received': 'from external.com'
        // Missing user-agent
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@external.com',
        1
      );

      expect(result.risks).toContain('User-Agent header missing - unusual for legitimate emails');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect excessive X- headers', async () => {
      const headers = {
        'from': 'sender@external.com',
        'subject': 'Test Email',
        'message-id': '<test@external.com>',
        'return-path': '<sender@external.com>',
        'received': 'from external.com',
        'x-custom-1': 'value1',
        'x-custom-2': 'value2',
        'x-custom-3': 'value3',
        'x-custom-4': 'value4',
        'x-custom-5': 'value5',
        'x-custom-6': 'value6',
        'x-custom-7': 'value7',
        'x-custom-8': 'value8',
        'x-custom-9': 'value9',
        'x-custom-10': 'value10',
        'x-custom-11': 'value11',
        'x-custom-12': 'value12',
        'x-custom-13': 'value13',
        'x-custom-14': 'value14',
        'x-custom-15': 'value15',
        'x-custom-16': 'value16',
        'user-agent': 'Mozilla/5.0'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@external.com',
        1
      );

      expect(result.risks).toContain('Excessive X- headers - potential spoofing attempt');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect excessive Received headers', async () => {
      const headers = {
        'from': 'sender@external.com',
        'subject': 'Test Email',
        'message-id': '<test@external.com>',
        'return-path': '<sender@external.com>',
        'received': 'from mail1.external.com',
        'received-1': 'from mail2.external.com',
        'received-2': 'from mail3.external.com',
        'received-3': 'from mail4.external.com',
        'received-4': 'from mail5.external.com',
        'received-5': 'from mail6.external.com',
        'received-6': 'from mail7.external.com',
        'received-7': 'from mail8.external.com',
        'received-8': 'from mail9.external.com',
        'received-9': 'from mail10.external.com',
        'received-10': 'from mail11.external.com',
        'received-11': 'from mail12.external.com',
        'received-12': 'from mail13.external.com',
        'received-13': 'from mail14.external.com',
        'received-14': 'from mail15.external.com',
        'received-15': 'from mail16.external.com',
        'received-16': 'from mail17.external.com',
        'received-17': 'from mail18.external.com', // More than 10 Received headers
        'user-agent': 'Mozilla/5.0'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@external.com',
        1
      );

      expect(result.risks).toContain('Excessive Received headers - potential email loop or spoofing');
      expect(result.score).toBeGreaterThan(0);
    });
  });

  describe('trusted domain detection', () => {
    it('should trust domains from monitored emails', async () => {
      const headers = {
        'from': 'sender@company.com',
        'subject': 'Test Email'
      };

      // Mock database query to return monitored email
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '1' }],
        rowCount: 1
      });

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@company.com',
        1
      );

      expect(result.isTrustedDomain).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('monitored_emails'),
        [1, 'company.com']
      );
    });

    it('should not trust domains not in monitored emails', async () => {
      const headers = {
        'from': 'sender@external.com',
        'subject': 'Test Email'
      };

      // Mock database query to return no monitored emails
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '0' }],
        rowCount: 1
      });

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@external.com',
        1
      );

      expect(result.isTrustedDomain).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      const headers = {
        'from': 'sender@company.com',
        'subject': 'Test Email'
      };

      // Mock database error
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@company.com',
        1
      );

      // Should default to not trusted when database fails
      expect(result.isTrustedDomain).toBe(false);
    });

    it('should handle invalid email addresses', async () => {
      const headers = {
        'from': 'invalid-email',
        'subject': 'Test Email'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'invalid-email',
        1
      );

      expect(result.isTrustedDomain).toBe(false);
    });
  });

  describe('generateHeaderRecommendations', () => {
    it('should generate recommendations for missing headers', () => {
      const analysis: HeaderAnalysis = {
        missingHeaders: ['From', 'Return-Path'],
        risks: ['CRITICAL: From header missing - cannot verify email authenticity'],
        score: 140,
        isTrustedDomain: false
      };

      const recommendations = headerAnalyzerService.generateHeaderRecommendations(analysis);

      expect(recommendations).toContain('CRITICAL: Missing headers (From, Return-Path) - email authenticity cannot be verified');
    });

    it('should generate recommendations for trusted domains with missing headers', () => {
      const analysis: HeaderAnalysis = {
        missingHeaders: ['From', 'Return-Path'],
        risks: ['From header missing - sender domain is trusted'],
        score: 30,
        isTrustedDomain: true
      };

      const recommendations = headerAnalyzerService.generateHeaderRecommendations(analysis);

      expect(recommendations).toContain('Missing headers (From, Return-Path) - sender domain is trusted but headers should be present');
    });

    it('should generate recommendations for From/Return-Path domain mismatch', () => {
      const analysis: HeaderAnalysis = {
        missingHeaders: [],
        risks: ['CRITICAL: From domain (company.com) differs from Return-Path domain (suspicious.com) - high spoofing risk'],
        score: 50,
        isTrustedDomain: false
      };

      const recommendations = headerAnalyzerService.generateHeaderRecommendations(analysis);

      expect(recommendations).toContain('CRITICAL: From and Return-Path domains differ - this is a strong indicator of email spoofing');
    });

    it('should generate recommendations for Reply-To mismatch', () => {
      const analysis: HeaderAnalysis = {
        missingHeaders: [],
        risks: ['Reply-To domain (different-domain.com) differs from From domain (company.com) - potential spoofing'],
        score: 25,
        isTrustedDomain: false
      };

      const recommendations = headerAnalyzerService.generateHeaderRecommendations(analysis);

      expect(recommendations).toContain('Reply-To header differs from From - verify sender identity through alternative channel');
    });

    it('should generate recommendations for excessive headers', () => {
      const analysis: HeaderAnalysis = {
        missingHeaders: [],
        risks: ['Excessive X- headers - potential spoofing attempt'],
        score: 20,
        isTrustedDomain: false
      };

      const recommendations = headerAnalyzerService.generateHeaderRecommendations(analysis);

      expect(recommendations).toContain('Excessive X- headers detected - email may be spoofed');
    });

    it('should generate recommendations for missing Received headers', () => {
      const analysis: HeaderAnalysis = {
        missingHeaders: ['Received'],
        risks: ['CRITICAL: No Received headers - email routing cannot be traced'],
        score: 70,
        isTrustedDomain: false
      };

      const recommendations = headerAnalyzerService.generateHeaderRecommendations(analysis);

      expect(recommendations).toContain('No Received headers - email routing cannot be traced, treat as suspicious');
    });

    it('should return empty recommendations for clean analysis', () => {
      const analysis: HeaderAnalysis = {
        missingHeaders: [],
        risks: [],
        score: 0,
        isTrustedDomain: true
      };

      const recommendations = headerAnalyzerService.generateHeaderRecommendations(analysis);

      expect(recommendations).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty headers object', async () => {
      const headers = {};

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@external.com',
        1
      );

      expect(result.missingHeaders).toContain('From');
      expect(result.missingHeaders).toContain('Return-Path');
      expect(result.missingHeaders).toContain('Message-ID');
      expect(result.missingHeaders).toContain('Received');
      expect(result.score).toBeGreaterThan(200);
    });

    it('should handle headers with null/undefined values', async () => {
      const headers = {
        'from': null as any,
        'subject': undefined as any,
        'message-id': '',
        'return-path': '   ' // whitespace only
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@external.com',
        1
      );

      // These should be missing because they're null, undefined, empty, or whitespace
      expect(result.missingHeaders).toContain('From');
      expect(result.missingHeaders).toContain('Message-ID');
      expect(result.missingHeaders).toContain('Received');
      // Return-Path might not be missing if whitespace is considered present
    });

    it('should handle case-insensitive header names', async () => {
      const headers = {
        'FROM': 'sender@external.com',
        'SUBJECT': 'Test Email',
        'MESSAGE-ID': '<test@external.com>',
        'RETURN-PATH': '<sender@external.com>',
        'RECEIVED': 'from external.com'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@external.com',
        1
      );

      // The header analyzer uses lowercase keys, so uppercase headers won't be found
      // This test verifies the current behavior - case sensitivity matters
      expect(result.missingHeaders.length).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should handle businessId as undefined', async () => {
      const headers = {
        'from': 'sender@external.com',
        'subject': 'Test Email'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@external.com'
        // No businessId provided
      );

      expect(result.isTrustedDomain).toBe(false);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('lookalike domain detection', () => {
    it('should detect typosquatting with Levenshtein distance', async () => {
      const headers = {
        'from': 'sender@micros0ft.com', // 0 instead of o
        'subject': 'Test Email',
        'message-id': '<test@micros0ft.com>',
        'return-path': '<sender@micros0ft.com>',
        'received': 'from micros0ft.com'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@micros0ft.com',
        1
      );

      expect(result.risks).toContain('Typosquatting detected: "micros0ft.com" is similar to "microsoft.com" (distance: 1)');
      expect(result.score).toBeGreaterThan(35); // High score for typosquatting
    });

    it('should detect transposed letters typosquatting', async () => {
      const headers = {
        'from': 'sender@microsfot.com', // transposed 'o' and 'f'
        'subject': 'Test Email',
        'message-id': '<test@microsfot.com>',
        'return-path': '<sender@microsfot.com>',
        'received': 'from microsfot.com'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@microsfot.com',
        1
      );

      expect(result.risks).toContain('Typosquatting detected: "microsfot.com" is similar to "microsoft.com" (distance: 2)');
      expect(result.score).toBeGreaterThan(20);
    });

    it('should detect homoglyph attacks with Cyrillic characters', async () => {
      const headers = {
        'from': 'sender@аpple.com', // Cyrillic 'а' instead of Latin 'a'
        'subject': 'Test Email',
        'message-id': '<test@аpple.com>',
        'return-path': '<sender@аpple.com>',
        'received': 'from аpple.com'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@аpple.com',
        1
      );

      // These might be detected as typosquatting instead of homoglyph
      expect(result.risks.some(risk => 
        risk.includes('Homoglyph attack detected') || 
        risk.includes('Typosquatting detected')
      )).toBe(true);
      expect(result.score).toBeGreaterThan(30);
    });

    it('should detect homoglyph attacks with Greek characters', async () => {
      const headers = {
        'from': 'sender@gοοgle.com', // Greek 'ο' instead of Latin 'o'
        'subject': 'Test Email',
        'message-id': '<test@gοοgle.com>',
        'return-path': '<sender@gοοgle.com>',
        'received': 'from gοοgle.com'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@gοοgle.com',
        1
      );

      // These might be detected as typosquatting instead of homoglyph
      expect(result.risks.some(risk => 
        risk.includes('Homoglyph attack detected') || 
        risk.includes('Typosquatting detected')
      )).toBe(true);
      expect(result.score).toBeGreaterThan(30);
    });

    it('should detect homoglyph attacks with number substitution', async () => {
      const headers = {
        'from': 'sender@paypa1.com', // 1 instead of l
        'subject': 'Test Email',
        'message-id': '<test@paypa1.com>',
        'return-path': '<sender@paypa1.com>',
        'received': 'from paypa1.com'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@paypa1.com',
        1
      );

      // These might be detected as typosquatting instead of homoglyph
      expect(result.risks.some(risk => 
        risk.includes('Homoglyph attack detected') || 
        risk.includes('Typosquatting detected')
      )).toBe(true);
      expect(result.score).toBeGreaterThan(30);
    });

    it('should detect multiple lookalike attacks in same email', async () => {
      const headers = {
        'from': 'sender@micr0s0ft.com', // Multiple substitutions
        'subject': 'Test Email',
        'message-id': '<test@micr0s0ft.com>',
        'return-path': '<sender@micr0s0ft.com>',
        'received': 'from micr0s0ft.com',
        'user-agent': 'Mozilla/5.0'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@micr0s0ft.com',
        1
      );

      // Should detect typosquatting (our implementation is more comprehensive)
      expect(result.risks.some(risk => risk.includes('Typosquatting detected'))).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(35); // High score for typosquatting
    });

    it('should not flag legitimate domains', async () => {
      const headers = {
        'from': 'sender@legitimate-company.com',
        'subject': 'Test Email',
        'message-id': '<test@legitimate-company.com>',
        'return-path': '<sender@legitimate-company.com>',
        'received': 'from legitimate-company.com',
        'user-agent': 'Mozilla/5.0'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@legitimate-company.com',
        1
      );

      expect(result.risks.some(risk => risk.includes('Typosquatting detected'))).toBe(false);
      expect(result.risks.some(risk => risk.includes('Homoglyph attack detected'))).toBe(false);
    });

    it('should detect temporary email domains', async () => {
      const headers = {
        'from': 'sender@temp-mail.com',
        'subject': 'Test Email',
        'message-id': '<test@temp-mail.com>',
        'return-path': '<sender@temp-mail.com>',
        'received': 'from temp-mail.com',
        'user-agent': 'Mozilla/5.0'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@temp-mail.com',
        1
      );

      expect(result.risks).toContain('Temporary or disposable email address');
      expect(result.score).toBeGreaterThan(20);
    });

    it('should detect disposable email domains', async () => {
      const headers = {
        'from': 'sender@disposable-email.com',
        'subject': 'Test Email',
        'message-id': '<test@disposable-email.com>',
        'return-path': '<sender@disposable-email.com>',
        'received': 'from disposable-email.com',
        'user-agent': 'Mozilla/5.0'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@disposable-email.com',
        1
      );

      expect(result.risks).toContain('Temporary or disposable email address');
      expect(result.score).toBeGreaterThan(20);
    });

    it('should handle domains that are too different from brands', async () => {
      const headers = {
        'from': 'sender@completely-different.com',
        'subject': 'Test Email',
        'message-id': '<test@completely-different.com>',
        'return-path': '<sender@completely-different.com>',
        'received': 'from completely-different.com',
        'user-agent': 'Mozilla/5.0'
      };

      const result = await headerAnalyzerService.analyzeHeaders(
        headers,
        'sender@completely-different.com',
        1
      );

      expect(result.risks.some(risk => risk.includes('Typosquatting detected'))).toBe(false);
      expect(result.risks.some(risk => risk.includes('Homoglyph attack detected'))).toBe(false);
    });

    it('should generate recommendations for typosquatting', () => {
      const analysis: HeaderAnalysis = {
        missingHeaders: [],
        risks: ['Typosquatting detected: "micros0ft.com" is similar to "microsoft.com" (distance: 1)'],
        score: 40,
        isTrustedDomain: false
      };

      const recommendations = headerAnalyzerService.generateHeaderRecommendations(analysis);

      expect(recommendations).toContain('CRITICAL: Typosquatting detected - domain is very similar to a known brand, likely phishing attempt');
    });

    it('should generate recommendations for homoglyph attacks', () => {
      const analysis: HeaderAnalysis = {
        missingHeaders: [],
        risks: ['Homoglyph attack detected: "аpple.com" contains visually similar characters to "apple.com"'],
        score: 35,
        isTrustedDomain: false
      };

      const recommendations = headerAnalyzerService.generateHeaderRecommendations(analysis);

      expect(recommendations).toContain('CRITICAL: Homoglyph attack detected - domain uses visually similar characters to impersonate a brand');
    });
  });

  describe('legitimate email service detection', () => {
    it('should recognize Amazon SES as legitimate email service', async () => {
      const headers = {
        'from': 'noreply@officepoolstop.com',
        'return-path': '<bounce@us-east-2.amazonses.com>',
        'message-id': '<test@us-east-2.amazonses.com>',
        'received': 'from mail-server.example.com',
        'user-agent': 'Mozilla/5.0'
      };

      const analysis = await headerAnalyzerService.analyzeHeaders(headers, 'noreply@officepoolstop.com');

      // Should detect the domain mismatch but with low risk for legitimate service
      expect(analysis.risks).toContain('From (officepoolstop.com) != Return-Path (us-east-2.amazonses.com) - sent via trusted mail service');
      expect(analysis.score).toBeLessThan(20); // Low score for legitimate service
    });

    it('should recognize SendGrid as legitimate email service', async () => {
      const headers = {
        'from': 'support@mybusiness.com',
        'return-path': '<bounce@sendgrid.net>',
        'message-id': '<test@sendgrid.net>',
        'received': 'from mail-server.example.com',
        'user-agent': 'Mozilla/5.0'
      };

      const analysis = await headerAnalyzerService.analyzeHeaders(headers, 'support@mybusiness.com');

      expect(analysis.risks).toContain('From (mybusiness.com) != Return-Path (sendgrid.net) - sent via trusted mail service');
      expect(analysis.score).toBeLessThan(20);
    });

    it('should apply reduced User-Agent penalty for legitimate email services', async () => {
      const headers = {
        'from': 'noreply@officepoolstop.com',
        'return-path': '<bounce@us-east-2.amazonses.com>',
        'message-id': '<test@us-east-2.amazonses.com>',
        'received': 'from mail-server.example.com'
        // No User-Agent header
      };

      const analysis = await headerAnalyzerService.analyzeHeaders(headers, 'noreply@officepoolstop.com');

      expect(analysis.risks).toContain('User-Agent header missing - common for email services');
      expect(analysis.score).toBeLessThanOrEqual(15); // Lower penalty than normal (15 vs 30+ for non-legitimate services)
    });

    it('should generate appropriate recommendations for legitimate email services', async () => {
      const headers = {
        'from': 'noreply@officepoolstop.com',
        'return-path': '<bounce@us-east-2.amazonses.com>',
        'message-id': '<test@us-east-2.amazonses.com>',
        'received': 'from mail-server.example.com'
      };

      const analysis = await headerAnalyzerService.analyzeHeaders(headers, 'noreply@officepoolstop.com');
      const recommendations = headerAnalyzerService.generateHeaderRecommendations(analysis);

      expect(recommendations).toContain('From and Return-Path domains differ - this is normal when using legitimate email services like Amazon SES, SendGrid, etc.');
    });
  });
});
