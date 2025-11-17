/**
 * Phishing Detector Integration Tests
 * Tests the main phishing detection orchestration that combines all analyzers
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { phishingDetector, type EmailAnalysis } from '../phishingDetector.js';
import { query } from '../../../../db/connection.js';

// Mock all detector services
jest.mock('../textAnalyzer.js');
jest.mock('../linkAnalyzer.js');
jest.mock('../attachmentAnalyzer.js');
jest.mock('../emailAuthDetector.js');
jest.mock('../headerAnalyzer.js');
jest.mock('../../../../db/connection.js');

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('PhishingDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default mocks
    const { textAnalyzer } = require('../textAnalyzer.js');
    const { linkAnalyzerService } = require('../linkAnalyzer.js');
    const { attachmentAnalyzerService } = require('../attachmentAnalyzer.js');
    const { emailAuthenticationService } = require('../emailAuthDetector.js');
    const { headerAnalyzerService } = require('../headerAnalyzer.js');

    (textAnalyzer.analyzeEmailText as jest.Mock).mockReturnValue({
      patterns: [],
      score: 0,
      subjectScore: 0,
      bodyScore: 0
    });

    (linkAnalyzerService.analyzeLinks as any).mockResolvedValue({
      totalLinks: 0,
      suspiciousLinks: [],
      risks: [],
      score: 0
    });

    (attachmentAnalyzerService.analyzeAttachments as jest.Mock).mockReturnValue({
      suspiciousAttachments: [],
      risks: [],
      score: 0
    });

    (emailAuthenticationService.isDomainAllowListed as any).mockResolvedValue(false);
    (emailAuthenticationService.analyzeEmailAuthentication as jest.Mock).mockReturnValue({
      spf: 'pass',
      dkim: 'pass',
      dmarc: 'pass'
    });
    (emailAuthenticationService.getAuthenticationRiskScore as any).mockReturnValue({
      risks: [],
      score: 0
    });
    (emailAuthenticationService.generateAuthenticationRecommendations as jest.Mock).mockReturnValue([]);

    (headerAnalyzerService.analyzeHeaders as any).mockResolvedValue({
      risks: [],
      score: 0
    });
    (headerAnalyzerService.generateHeaderRecommendations as jest.Mock).mockReturnValue([]);

    (linkAnalyzerService.generateLinkRecommendations as jest.Mock).mockReturnValue([]);
    (attachmentAnalyzerService.generateAttachmentRecommendations as jest.Mock).mockReturnValue([]);
  });

  describe('analyzeEmail', () => {
    it('should combine results from all analyzers into threat assessment', async () => {
      const { textAnalyzer } = require('../textAnalyzer.js');
      const { linkAnalyzerService } = require('../linkAnalyzer.js');
      const { attachmentAnalyzerService } = require('../attachmentAnalyzer.js');
      const { emailAuthenticationService } = require('../emailAuthDetector.js');
      const { headerAnalyzerService } = require('../headerAnalyzer.js');

      (textAnalyzer.analyzeEmailText as jest.Mock).mockReturnValue({
        patterns: ['urgent_action_required', 'personal_info_request'],
        score: 25,
        subjectScore: 15,
        bodyScore: 10
      });

      (linkAnalyzerService.analyzeLinks as any).mockResolvedValue({
        totalLinks: 2,
        suspiciousLinks: ['http://suspicious.com'],
        risks: ['Suspicious domain detected'],
        score: 20
      });

      (attachmentAnalyzerService.analyzeAttachments as jest.Mock).mockReturnValue({
        suspiciousAttachments: [],
        risks: [],
        score: 0
      });

      (emailAuthenticationService.getAuthenticationRiskScore as any).mockReturnValue({
        risks: ['SPF check failed'],
        score: 15
      });

      (headerAnalyzerService.analyzeHeaders as any).mockResolvedValue({
        risks: ['Missing security headers'],
        score: 10
      });

      (linkAnalyzerService.generateLinkRecommendations as jest.Mock).mockReturnValue(['Be cautious of suspicious links']);
      (attachmentAnalyzerService.generateAttachmentRecommendations as jest.Mock).mockReturnValue([]);

      const emailData: EmailAnalysis = {
        subject: 'URGENT: Verify your account',
        body: 'Click here to verify: http://suspicious.com',
        sender: 'suspicious@example.com',
        recipient: 'user@business.com',
        links: ['http://suspicious.com'],
        headers: {
          'from': 'suspicious@example.com',
          'spf': 'fail'
        }
      };

      const result = await phishingDetector.analyzeEmail(emailData, 1);

      // Score calculation: textAnalysis (25) + linkAnalysis (20) + auth (15) + header (10) = 70, which is "high" (>= 60)
      expect(result.threatLevel).toBe('high');
      expect(result.confidence).toBeGreaterThanOrEqual(70);
      expect(result.detectedPatterns).toContain('urgent_action_required');
      expect(result.detectedPatterns).toContain('personal_info_request');
      expect(result.riskFactors).toContain('Suspicious domain detected');
      expect(result.riskFactors).toContain('SPF check failed');
      expect(result.riskFactors).toContain('Missing security headers');
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.linkAnalysis).toBeDefined();
      expect(result.authenticationResults).toBeDefined();
      expect(result.headerAnalysis).toBeDefined();
    });

    it('should handle missing headers as critical risk for non-allowlisted domains', async () => {
      const { emailAuthenticationService } = require('../emailAuthDetector.js');
      (emailAuthenticationService.isDomainAllowListed as any).mockResolvedValue(false);

      const emailData: EmailAnalysis = {
        subject: 'Normal email',
        body: 'Normal content',
        sender: 'unknown@example.com',
        recipient: 'user@business.com'
        // No headers provided
      };

      const result = await phishingDetector.analyzeEmail(emailData, 1);

      expect(result.threatLevel).toBe('critical');
      expect(result.confidence).toBeGreaterThanOrEqual(100);
      expect(result.riskFactors).toContain('No email headers available for authentication analysis');
      expect(result.recommendations.some(rec => rec.includes('CRITICAL'))).toBe(true);
    });

    it('should reduce penalty for missing headers when domain is allowlisted', async () => {
      const { emailAuthenticationService } = require('../emailAuthDetector.js');
      (emailAuthenticationService.isDomainAllowListed as any).mockResolvedValue(true);

      const emailData: EmailAnalysis = {
        subject: 'Normal email',
        body: 'Normal content',
        sender: 'trusted@business.com',
        recipient: 'user@business.com'
        // No headers provided
      };

      const result = await phishingDetector.analyzeEmail(emailData, 1);

      expect(result.threatLevel).toBe('low');
      expect(result.riskFactors).toContain('No email headers available - sender domain is allow-listed');
      expect(result.confidence).toBeLessThan(30);
    });

    it('should detect Business Email Compromise patterns', async () => {
      const { textAnalyzer } = require('../textAnalyzer.js');
      (textAnalyzer.analyzeEmailText as jest.Mock).mockReturnValue({
        patterns: ['ceo_fraud'],
        score: 30,
        subjectScore: 20,
        bodyScore: 10
      });

      const emailData: EmailAnalysis = {
        subject: 'CEO Urgent Request',
        body: 'I need you to wire transfer $50,000 urgently. This is confidential.',
        sender: 'ceo@company.com',
        recipient: 'finance@company.com',
        headers: {
          'from': 'ceo@company.com'
        }
      };

      const result = await phishingDetector.analyzeEmail(emailData, 1);

      expect(result.riskFactors.some(risk => risk.includes('Executive impersonation'))).toBe(true);
      expect(result.riskFactors.some(risk => risk.includes('Wire transfer request'))).toBe(true);
      expect(result.recommendations.some(rec => rec.includes('alternative communication channel'))).toBe(true);
    });

    it('should calculate correct threat levels based on score thresholds', async () => {
      const { textAnalyzer } = require('../textAnalyzer.js');
      const { linkAnalyzerService } = require('../linkAnalyzer.js');
      const { attachmentAnalyzerService } = require('../attachmentAnalyzer.js');

      // Test critical threshold (>= 80)
      (textAnalyzer.analyzeEmailText as jest.Mock).mockReturnValue({
        patterns: ['urgent_action_required'],
        score: 50,
        subjectScore: 30,
        bodyScore: 20
      });
      (linkAnalyzerService.analyzeLinks as any).mockResolvedValue({
        totalLinks: 1,
        suspiciousLinks: ['http://malicious.com'],
        risks: ['Malicious domain'],
        score: 35
      });
      (linkAnalyzerService.generateLinkRecommendations as jest.Mock).mockReturnValue([]);
      (attachmentAnalyzerService.generateAttachmentRecommendations as jest.Mock).mockReturnValue([]);

      const criticalEmail: EmailAnalysis = {
        subject: 'URGENT',
        body: 'Click here',
        sender: 'bad@example.com',
        recipient: 'user@business.com',
        links: ['http://malicious.com'],
        headers: {}
      };

      const criticalResult = await phishingDetector.analyzeEmail(criticalEmail, 1);
      expect(criticalResult.threatLevel).toBe('critical');

      // Test high threshold (>= 60)
      const { emailAuthenticationService } = require('../emailAuthDetector.js');
      const { headerAnalyzerService } = require('../headerAnalyzer.js');
      
      (linkAnalyzerService.analyzeLinks as any).mockResolvedValue({
        totalLinks: 1,
        suspiciousLinks: [],
        risks: [],
        score: 10
      });
      (linkAnalyzerService.generateLinkRecommendations as jest.Mock).mockReturnValue([]);
      (emailAuthenticationService.getAuthenticationRiskScore as any).mockReturnValue({
        risks: [],
        score: 0
      });
      (headerAnalyzerService.analyzeHeaders as any).mockResolvedValue({
        risks: [],
        score: 0
      });
      (headerAnalyzerService.generateHeaderRecommendations as jest.Mock).mockReturnValue([]);

      const highEmail: EmailAnalysis = {
        subject: 'URGENT',
        body: 'Click here',
        sender: 'bad@example.com',
        recipient: 'user@business.com',
        links: ['http://example.com'], // Need at least one link for linkAnalysis to be called
        headers: {
          'from': 'bad@example.com',
          'spf': 'pass'
        }
      };

      const highResult = await phishingDetector.analyzeEmail(highEmail, 1);
      // Score: textAnalysis (50) + linkAnalysis (10) = 60, which is "high" (>= 60)
      expect(highResult.threatLevel).toBe('high');

      // Test medium threshold (>= 30)
      (textAnalyzer.analyzeEmailText as jest.Mock).mockReturnValue({
        patterns: [],
        score: 25,
        subjectScore: 15,
        bodyScore: 10
      });
      // Mock allowlisted domain to avoid critical penalty for missing headers
      (emailAuthenticationService.isDomainAllowListed as any).mockResolvedValue(true);

      const mediumEmail: EmailAnalysis = {
        subject: 'Normal',
        body: 'Content',
        sender: 'sender@example.com',
        recipient: 'user@business.com',
        headers: {}
      };

      const mediumResult = await phishingDetector.analyzeEmail(mediumEmail, 1);
      // Score: textAnalysis (25) + missing headers penalty for allowlisted (20) = 45, which is "medium" (>= 30)
      expect(mediumResult.threatLevel).toBe('medium');

      // Test low threshold (< 30)
      (textAnalyzer.analyzeEmailText as jest.Mock).mockReturnValue({
        patterns: [],
        score: 5,
        subjectScore: 3,
        bodyScore: 2
      });

      const lowEmail: EmailAnalysis = {
        subject: 'Normal',
        body: 'Content',
        sender: 'legitimate@example.com',
        recipient: 'user@business.com',
        headers: {
          'spf': 'pass',
          'dkim': 'pass',
          'dmarc': 'pass'
        }
      };

      const lowResult = await phishingDetector.analyzeEmail(lowEmail, 1);
      expect(lowResult.threatLevel).toBe('low');
    });

    it('should generate appropriate recommendations based on threat level and patterns', async () => {
      const { textAnalyzer } = require('../textAnalyzer.js');
      (textAnalyzer.analyzeEmailText as jest.Mock).mockReturnValue({
        patterns: ['personal_info_request', 'urgent_action_required'],
        score: 85,
        subjectScore: 50,
        bodyScore: 35
      });

      const emailData: EmailAnalysis = {
        subject: 'URGENT: Verify your account',
        body: 'Please provide your SSN immediately',
        sender: 'phishing@example.com',
        recipient: 'user@business.com',
        headers: {}
      };

      const result = await phishingDetector.analyzeEmail(emailData, 1);

      expect(result.recommendations).toContain('IMMEDIATE ACTION REQUIRED: Do not click any links or download attachments');
      expect(result.recommendations).toContain('Never provide personal information via email');
      expect(result.recommendations).toContain('Be cautious of urgent requests - legitimate organizations rarely require immediate action');
    });

    it('should handle emails with no links or attachments gracefully', async () => {
      const emailData: EmailAnalysis = {
        subject: 'Normal email',
        body: 'Just text content',
        sender: 'sender@example.com',
        recipient: 'user@business.com',
        headers: {
          'spf': 'pass',
          'dkim': 'pass'
        }
      };

      const result = await phishingDetector.analyzeEmail(emailData, 1);

      expect(result).toBeDefined();
      expect(result.threatLevel).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.linkAnalysis).toBeUndefined();
      expect(result.attachmentAnalysis).toBeUndefined();
    });
  });

  describe('storeThreatAssessment', () => {
    it('should store threat assessment in database with correct data', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 1
      } as any);

      const assessment = {
        threatLevel: 'high' as const,
        confidence: 75,
        detectedPatterns: ['urgent_action_required'],
        riskFactors: ['Suspicious link'],
        recommendations: ['Be cautious'],
        authenticationResults: undefined,
        headerAnalysis: undefined,
        linkAnalysis: undefined,
        attachmentAnalysis: undefined
      };

      const emailData: EmailAnalysis = {
        subject: 'Test',
        body: 'Content',
        sender: 'test@example.com',
        recipient: 'user@business.com'
      };

      await phishingDetector.storeThreatAssessment(1, 100, assessment, emailData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO phishing_alerts'),
        expect.arrayContaining([
          1, // business_id
          100, // email_id
          'Test', // subject
          'test@example.com', // sender_email
          'user@business.com', // recipient_email
          'high', // threat_level
          'pending', // status
          'phishing_detection', // alert_type
          expect.stringContaining('Threat Level: HIGH'), // description
          expect.stringContaining('"threatLevel":"high"') // raw_email_data JSON
        ])
      );
    });

    it('should throw error when database insert fails', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const assessment = {
        threatLevel: 'low' as const,
        confidence: 10,
        detectedPatterns: [],
        riskFactors: [],
        recommendations: [],
        authenticationResults: undefined,
        headerAnalysis: undefined,
        linkAnalysis: undefined,
        attachmentAnalysis: undefined
      };

      const emailData: EmailAnalysis = {
        subject: 'Test',
        body: 'Content',
        sender: 'test@example.com',
        recipient: 'user@business.com'
      };

      await expect(
        phishingDetector.storeThreatAssessment(1, 100, assessment, emailData)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getThreatStatistics', () => {
    it('should return threat statistics grouped by level and date', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { threat_level: 'high', count: '5', date: new Date('2024-01-15') },
          { threat_level: 'medium', count: '3', date: new Date('2024-01-15') },
          { threat_level: 'low', count: '2', date: new Date('2024-01-14') }
        ],
        rowCount: 3
      } as any);

      const stats = await phishingDetector.getThreatStatistics(1, 30);

      expect(stats).toHaveLength(3);
      expect(stats[0]).toHaveProperty('threat_level');
      expect(stats[0]).toHaveProperty('count');
      expect(stats[0]).toHaveProperty('date');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [1]
      );
    });

    it('should return empty array on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const stats = await phishingDetector.getThreatStatistics(1, 30);

      expect(stats).toEqual([]);
    });

    it('should use custom days parameter in query', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0
      } as any);

      await phishingDetector.getThreatStatistics(1, 7);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '7 days'"),
        [1]
      );
    });
  });
});

