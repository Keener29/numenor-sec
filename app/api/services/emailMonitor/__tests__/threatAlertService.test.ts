/**
 * ThreatAlertService Tests
 * Tests phishing banner injection and threat alert notifications
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { ThreatAlertService } from '../threatAlertService.js';
import type { MonitoredEmail, EmailMessage } from '../types.js';
import type { ThreatAssessment } from '../../../types/email.js';

// Mock logger
jest.mock('../../../../utils/logger.js', () => ({
  monitoringLogger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock database connection
const mockQuery = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../../../db/connection.js', () => ({
  query: (...args: any[]) => mockQuery(...args)
}));

// Mock emailService
const mockSendThreatAlert = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../emailService.js', () => ({
  emailService: {
    sendThreatAlert: (...args: any[]) => mockSendThreatAlert(...args)
  }
}));

// Mock Gmail OAuth service
const mockGetFullMessage = jest.fn() as jest.MockedFunction<any>;
const mockCreateDraftWithContent = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../oauth/gmail/GmailOAuthService.js', () => ({
  gmailOAuthService: {
    getFullMessage: (...args: any[]) => mockGetFullMessage(...args),
    createDraftWithContent: (...args: any[]) => mockCreateDraftWithContent(...args)
  }
}));

describe('ThreatAlertService', () => {
  let service: ThreatAlertService;
  let monitoredEmail: MonitoredEmail;
  let emailMessage: EmailMessage;
  let threatAssessment: ThreatAssessment;

  beforeEach(() => {
    service = new ThreatAlertService();
    jest.clearAllMocks();

    monitoredEmail = {
      id: 1,
      businessId: 100,
      emailAddress: 'monitored@example.com',
      isConnected: true,
      lastChecked: null
    };

    emailMessage = {
      id: 'msg-123',
      subject: 'Test Email',
      body: 'Test body',
      sender: 'sender@example.com',
      recipient: 'monitored@example.com',
      timestamp: new Date(),
      attachments: [],
      links: [],
      headers: {}
    };

    threatAssessment = {
      threatLevel: 'high',
      confidence: 75,
      detectedPatterns: ['suspicious_link', 'urgent_language'],
      riskFactors: ['Unknown sender'],
      recommendations: ['Do not click links']
    };
  });

  describe('injectPhishingBannerIntoEmail', () => {
    it('should inject phishing banner successfully', async () => {
      const fullGmailMessage = { id: 'msg-123', threadId: 'thread-456' };
      mockGetFullMessage.mockResolvedValueOnce(fullGmailMessage);
      mockCreateDraftWithContent.mockResolvedValueOnce('draft-789');

      await service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

      expect(mockGetFullMessage).toHaveBeenCalledWith(100, 'monitored@example.com', 'msg-123');
      expect(mockCreateDraftWithContent).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: 100,
          emailAddress: 'monitored@example.com',
          originalMessage: fullGmailMessage,
          subject: 'Fwd: Test Email',
          from: 'monitored@example.com',
          to: 'sender@example.com'
        })
      );
    });

    it('should generate reason from detected patterns', async () => {
      threatAssessment = { ...threatAssessment, detectedPatterns: ['suspicious_link', 'urgent_language'] };
      threatAssessment = { ...threatAssessment, authenticationResults: undefined };
      
      const fullGmailMessage = { id: 'msg-123' };
      mockGetFullMessage.mockResolvedValueOnce(fullGmailMessage);
      mockCreateDraftWithContent.mockResolvedValueOnce('draft-789');

      await service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

      // Should use detected patterns for reason
      const draftCall = mockCreateDraftWithContent.mock.calls[0][0];
      expect(draftCall.modifiedPlainText).toContain('suspicious link, urgent language');
    });

    it('should generate reason from authentication results when available', async () => {
      threatAssessment = { ...threatAssessment, authenticationResults: {
        overall: 'fail',
        spf: 'pass',
        dkim: 'fail',
        dmarc: 'fail'
      } };
      threatAssessment = { ...threatAssessment, detectedPatterns: ['suspicious_link'] };
      
      const fullGmailMessage = { id: 'msg-123' };
      mockGetFullMessage.mockResolvedValueOnce(fullGmailMessage);
      mockCreateDraftWithContent.mockResolvedValueOnce('draft-789');

      await service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

      // Should prioritize authentication results over patterns
      const draftCall = mockCreateDraftWithContent.mock.calls[0][0];
      expect(draftCall.modifiedPlainText).toContain('Authentication overall results: fail');
    });

    it('should generate reason from risk factors when no patterns', async () => {
      threatAssessment = { ...threatAssessment, detectedPatterns: [] };
      threatAssessment = { ...threatAssessment, riskFactors: ['Unknown sender', 'Suspicious domain'] };
      threatAssessment = { ...threatAssessment, authenticationResults: undefined };
      
      const fullGmailMessage = { id: 'msg-123' };
      mockGetFullMessage.mockResolvedValueOnce(fullGmailMessage);
      mockCreateDraftWithContent.mockResolvedValueOnce('draft-789');

      await service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

      const draftCall = mockCreateDraftWithContent.mock.calls[0][0];
      expect(draftCall.modifiedPlainText).toContain('Unknown sender');
    });

    it('should use default reason when no patterns or risk factors', async () => {
      threatAssessment = { ...threatAssessment, detectedPatterns: [] };
      threatAssessment = { ...threatAssessment, riskFactors: [] };
      threatAssessment = { ...threatAssessment, authenticationResults: undefined };
      
      const fullGmailMessage = { id: 'msg-123' };
      mockGetFullMessage.mockResolvedValueOnce(fullGmailMessage);
      mockCreateDraftWithContent.mockResolvedValueOnce('draft-789');

      await service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

      const draftCall = mockCreateDraftWithContent.mock.calls[0][0];
      expect(draftCall.modifiedPlainText).toContain('high threat level detected');
    });

    it('should sanitize HTML in reason', async () => {
      threatAssessment = { ...threatAssessment, detectedPatterns: ['pattern_with_<script>', 'pattern_with_&amp;'] };
      
      const fullGmailMessage = { id: 'msg-123' };
      mockGetFullMessage.mockResolvedValueOnce(fullGmailMessage);
      mockCreateDraftWithContent.mockResolvedValueOnce('draft-789');

      await service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

      const draftCall = mockCreateDraftWithContent.mock.calls[0][0];
      // HTML should be sanitized in banner HTML
      expect(draftCall.modifiedHtml).toContain('&lt;');
      expect(draftCall.modifiedHtml).toContain('&amp;');
    });

    it('should include confidence score when available', async () => {
      threatAssessment = { ...threatAssessment, confidence: 85 };
      
      const fullGmailMessage = { id: 'msg-123' };
      mockGetFullMessage.mockResolvedValueOnce(fullGmailMessage);
      mockCreateDraftWithContent.mockResolvedValueOnce('draft-789');

      await service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

      const draftCall = mockCreateDraftWithContent.mock.calls[0][0];
      expect(draftCall.modifiedPlainText).toContain('Score: 85');
    });

    it('should not include confidence score when null', async () => {
      threatAssessment = { ...threatAssessment, confidence: null as any };
      
      const fullGmailMessage = { id: 'msg-123' };
      mockGetFullMessage.mockResolvedValueOnce(fullGmailMessage);
      mockCreateDraftWithContent.mockResolvedValueOnce('draft-789');

      await service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

      const draftCall = mockCreateDraftWithContent.mock.calls[0][0];
      expect(draftCall.modifiedPlainText).not.toContain('Score:');
    });

    it('should use correct styles for medium threat level', async () => {
      threatAssessment = { ...threatAssessment, threatLevel: 'medium' };
      
      const fullGmailMessage = { id: 'msg-123' };
      mockGetFullMessage.mockResolvedValueOnce(fullGmailMessage);
      mockCreateDraftWithContent.mockResolvedValueOnce('draft-789');

      await service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

      const draftCall = mockCreateDraftWithContent.mock.calls[0][0];
      expect(draftCall.modifiedHtml).toContain('#fff4cc'); // Medium background color
      expect(draftCall.modifiedHtml).toContain('#f7c948'); // Medium border color
    });

    it('should use correct styles for high threat level', async () => {
      threatAssessment = { ...threatAssessment, threatLevel: 'high' };
      
      const fullGmailMessage = { id: 'msg-123' };
      mockGetFullMessage.mockResolvedValueOnce(fullGmailMessage);
      mockCreateDraftWithContent.mockResolvedValueOnce('draft-789');

      await service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

      const draftCall = mockCreateDraftWithContent.mock.calls[0][0];
      expect(draftCall.modifiedHtml).toContain('#fff1e0'); // High background color
      expect(draftCall.modifiedHtml).toContain('#ff9f43'); // High border color
    });

    it('should use correct styles for critical threat level', async () => {
      threatAssessment = { ...threatAssessment, threatLevel: 'critical' };
      
      const fullGmailMessage = { id: 'msg-123' };
      mockGetFullMessage.mockResolvedValueOnce(fullGmailMessage);
      mockCreateDraftWithContent.mockResolvedValueOnce('draft-789');

      await service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

      const draftCall = mockCreateDraftWithContent.mock.calls[0][0];
      expect(draftCall.modifiedHtml).toContain('#ffecec'); // Critical background color
      expect(draftCall.modifiedHtml).toContain('#ff3b30'); // Critical border color
    });

    it('should handle errors gracefully without throwing', async () => {
      const bannerError = new Error('Banner creation failed');
      mockGetFullMessage.mockRejectedValueOnce(bannerError);

      // Should not throw - errors are caught and logged
      await expect(
        service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment)
      ).resolves.not.toThrow();

      expect(mockCreateDraftWithContent).not.toHaveBeenCalled();
    });

    it('should limit detected patterns to first 2 in reason', async () => {
      threatAssessment = { ...threatAssessment, detectedPatterns: ['pattern1', 'pattern2', 'pattern3', 'pattern4'] };
      
      const fullGmailMessage = { id: 'msg-123' };
      mockGetFullMessage.mockResolvedValueOnce(fullGmailMessage);
      mockCreateDraftWithContent.mockResolvedValueOnce('draft-789');

      await service.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

      const draftCall = mockCreateDraftWithContent.mock.calls[0][0];
      expect(draftCall.modifiedPlainText).toContain('pattern1, pattern2');
      expect(draftCall.modifiedPlainText).not.toContain('pattern3');
    });
  });

  describe('sendThreatAlert', () => {
    it('should send threat alert successfully', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          email: 'owner@example.com',
          business_name: 'Test Business'
        }]
      });
      mockSendThreatAlert.mockResolvedValueOnce(undefined);

      await service.sendThreatAlert(monitoredEmail, emailMessage, threatAssessment);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT u.email, b.business_name'),
        [100]
      );
      expect(mockSendThreatAlert).toHaveBeenCalledWith(
        'Test Business',
        'owner@example.com',
        'monitored@example.com',
        emailMessage,
        threatAssessment
      );
    });

    it('should return early when business owner not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [] // No business owner found
      });

      await service.sendThreatAlert(monitoredEmail, emailMessage, threatAssessment);

      // Should not call emailService when owner not found
      expect(mockSendThreatAlert).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully without throwing', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          email: 'owner@example.com',
          business_name: 'Test Business'
        }]
      });
      const sendError = new Error('Email send failed');
      mockSendThreatAlert.mockRejectedValueOnce(sendError);

      // Should not throw - errors are caught and logged
      await expect(
        service.sendThreatAlert(monitoredEmail, emailMessage, threatAssessment)
      ).resolves.not.toThrow();
    });

    it('should handle database query errors gracefully', async () => {
      const dbError = new Error('Database query failed');
      mockQuery.mockRejectedValueOnce(dbError);

      // Should not throw - errors are caught and logged
      await expect(
        service.sendThreatAlert(monitoredEmail, emailMessage, threatAssessment)
      ).resolves.not.toThrow();

      expect(mockSendThreatAlert).not.toHaveBeenCalled();
    });
  });
});

