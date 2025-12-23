/**
 * EmailProcessor Tests
 * Tests email processing and phishing detection orchestration
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { EmailProcessor } from '../emailProcessor.js';
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

// Mock phishing detector
const mockAnalyzeEmail = jest.fn() as jest.MockedFunction<any>;
const mockStoreThreatAssessment = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../detector/phishingDetector.js', () => ({
  phishingDetector: {
    analyzeEmail: (...args: any[]) => mockAnalyzeEmail(...args),
    storeThreatAssessment: (...args: any[]) => mockStoreThreatAssessment(...args)
  }
}));

// Mock email utilities
const mockExtractEmailAddress = jest.fn() as jest.MockedFunction<any>;
const mockIsFromOwnService = jest.fn() as jest.MockedFunction<any>;
const mockIsReplyOrForward = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../../utils/emailUtils.js', () => ({
  extractEmailAddress: (...args: any[]) => mockExtractEmailAddress(...args),
  isFromOwnService: (...args: any[]) => mockIsFromOwnService(...args),
  isReplyOrForward: (...args: any[]) => mockIsReplyOrForward(...args)
}));

// Mock security event logger
const mockLogSecurityEvent = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../../utils/securityEventLogger.js', () => ({
  securityEventLogger: {
    logSecurityEvent: (...args: any[]) => mockLogSecurityEvent(...args)
  }
}));

// Mock threat alert service
const mockInjectPhishingBanner = jest.fn() as jest.MockedFunction<any>;
const mockSendThreatAlert = jest.fn() as jest.MockedFunction<any>;
jest.mock('../threatAlertService.js', () => ({
  threatAlertService: {
    injectPhishingBannerIntoEmail: (...args: any[]) => mockInjectPhishingBanner(...args),
    sendThreatAlert: (...args: any[]) => mockSendThreatAlert(...args)
  }
}));

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let monitoredEmail: MonitoredEmail;
  let emailMessage: EmailMessage;

  beforeEach(() => {
    processor = new EmailProcessor();
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
      body: 'Test body content',
      sender: 'sender@example.com',
      recipient: 'monitored@example.com',
      timestamp: new Date(),
      attachments: [],
      links: [],
      headers: {}
    };

    // Default mocks
    mockExtractEmailAddress.mockReturnValue('sender@example.com');
    mockIsFromOwnService.mockReturnValue(false);
    mockIsReplyOrForward.mockReturnValue(false);
  });

  describe('processEmailMessage', () => {
    it('should skip processing for emails from own service', async () => {
      mockIsFromOwnService.mockReturnValue(true);

      await processor.processEmailMessage(monitoredEmail, emailMessage);

      // Should not call phishing detector
      expect(mockAnalyzeEmail).not.toHaveBeenCalled();
      expect(mockInjectPhishingBanner).not.toHaveBeenCalled();
    });

    it('should process email and detect low threat level', async () => {
      const threatAssessment: ThreatAssessment = {
        threatLevel: 'low',
        confidence: 20,
        detectedPatterns: [],
        riskFactors: [],
        recommendations: []
      };
      mockAnalyzeEmail.mockResolvedValueOnce(threatAssessment);

      await processor.processEmailMessage(monitoredEmail, emailMessage);

      // Verify email was analyzed
      expect(mockAnalyzeEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Test Email',
          body: 'Test body content',
          sender: 'sender@example.com',
          recipient: 'monitored@example.com'
        }),
        false, // isReplyOrForward
        100 // businessId
      );

      // Low threat should not trigger alerts
      expect(mockInjectPhishingBanner).not.toHaveBeenCalled();
      expect(mockStoreThreatAssessment).not.toHaveBeenCalled();
      expect(mockSendThreatAlert).not.toHaveBeenCalled();
    });

    it('should process email and detect medium threat level', async () => {
      const threatAssessment: ThreatAssessment = {
        threatLevel: 'medium',
        confidence: 50,
        detectedPatterns: ['suspicious_link'],
        riskFactors: ['Unknown sender'],
        recommendations: ['Verify sender']
      };
      mockAnalyzeEmail.mockResolvedValueOnce(threatAssessment);

      await processor.processEmailMessage(monitoredEmail, emailMessage);

      // Medium threat should not trigger alerts (only high/critical)
      expect(mockInjectPhishingBanner).not.toHaveBeenCalled();
      expect(mockStoreThreatAssessment).not.toHaveBeenCalled();
      expect(mockSendThreatAlert).not.toHaveBeenCalled();
    });

    it('should process email and handle high threat level', async () => {
      const threatAssessment: ThreatAssessment = {
        threatLevel: 'high',
        confidence: 75,
        detectedPatterns: ['suspicious_link', 'urgent_language'],
        riskFactors: ['Unknown sender', 'Suspicious domain'],
        recommendations: ['Do not click links']
      };
      mockAnalyzeEmail.mockResolvedValueOnce(threatAssessment);

      await processor.processEmailMessage(monitoredEmail, emailMessage);

      // High threat should trigger all alert mechanisms
      expect(mockInjectPhishingBanner).toHaveBeenCalledWith(
        monitoredEmail,
        emailMessage,
        threatAssessment
      );
      expect(mockStoreThreatAssessment).toHaveBeenCalledWith(
        100, // businessId
        1, // emailId
        threatAssessment,
        expect.objectContaining({
          subject: 'Test Email',
          body: 'Test body content'
        })
      );
      expect(mockSendThreatAlert).toHaveBeenCalledWith(
        monitoredEmail,
        emailMessage,
        threatAssessment
      );
      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        100, // businessId
        'phishing_detected',
        expect.stringContaining('high threat level'),
        expect.objectContaining({
          emailId: 1,
          emailAddress: 'monitored@example.com',
          threatLevel: 'high',
          confidence: 75
        })
      );
    });

    it('should process email and handle critical threat level', async () => {
      const threatAssessment: ThreatAssessment = {
        threatLevel: 'critical',
        confidence: 95,
        detectedPatterns: ['malicious_link', 'spoofed_sender'],
        riskFactors: ['Spoofed domain', 'Malicious attachment'],
        recommendations: ['Delete immediately']
      };
      mockAnalyzeEmail.mockResolvedValueOnce(threatAssessment);

      await processor.processEmailMessage(monitoredEmail, emailMessage);

      // Critical threat should trigger all alert mechanisms
      expect(mockInjectPhishingBanner).toHaveBeenCalled();
      expect(mockStoreThreatAssessment).toHaveBeenCalled();
      expect(mockSendThreatAlert).toHaveBeenCalled();
      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        100,
        'phishing_detected',
        expect.stringContaining('critical threat level'),
        expect.objectContaining({
          threatLevel: 'critical'
        })
      );
    });

    it('should handle reply/forward emails correctly', async () => {
      mockIsReplyOrForward.mockReturnValue(true);
      const threatAssessment: ThreatAssessment = {
        threatLevel: 'low',
        confidence: 10,
        detectedPatterns: [],
        riskFactors: [],
        recommendations: []
      };
      mockAnalyzeEmail.mockResolvedValueOnce(threatAssessment);

      await processor.processEmailMessage(monitoredEmail, emailMessage);

      // Should pass isReplyOrForward flag to analyzer
      expect(mockAnalyzeEmail).toHaveBeenCalledWith(
        expect.any(Object),
        true, // isReplyOrForward
        100
      );
    });

    it('should extract email address from sender field', async () => {
      emailMessage = { ...emailMessage, sender: 'Test User <sender@example.com>' };
      mockExtractEmailAddress.mockReturnValue('sender@example.com');
      const threatAssessment: ThreatAssessment = {
        threatLevel: 'low',
        confidence: 10,
        detectedPatterns: [],
        riskFactors: [],
        recommendations: []
      };
      mockAnalyzeEmail.mockResolvedValueOnce(threatAssessment);

      await processor.processEmailMessage(monitoredEmail, emailMessage);

      expect(mockExtractEmailAddress).toHaveBeenCalledWith('Test User <sender@example.com>');
      expect(mockAnalyzeEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: 'sender@example.com' // Extracted address
        }),
        false,
        100
      );
    });

    it('should handle null extracted email address', async () => {
      mockExtractEmailAddress.mockReturnValue(null);
      const threatAssessment: ThreatAssessment = {
        threatLevel: 'low',
        confidence: 10,
        detectedPatterns: [],
        riskFactors: [],
        recommendations: []
      };
      mockAnalyzeEmail.mockResolvedValueOnce(threatAssessment);

      await processor.processEmailMessage(monitoredEmail, emailMessage);

      // Should pass empty string when extraction fails
      expect(mockAnalyzeEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: '' // Empty string when extraction fails
        }),
        false,
        100
      );
    });

    it('should include attachments and links in email analysis', async () => {
      emailMessage = { ...emailMessage, attachments: ['file.pdf'] };
      emailMessage = { ...emailMessage, links: ['https://example.com'] };
      const threatAssessment: ThreatAssessment = {
        threatLevel: 'low',
        confidence: 10,
        detectedPatterns: [],
        riskFactors: [],
        recommendations: []
      };
      mockAnalyzeEmail.mockResolvedValueOnce(threatAssessment);

      await processor.processEmailMessage(monitoredEmail, emailMessage);

      expect(mockAnalyzeEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: ['file.pdf'],
          links: ['https://example.com']
        }),
        false,
        100
      );
    });

    it('should handle errors during email processing', async () => {
      const processingError = new Error('Phishing detection failed');
      mockAnalyzeEmail.mockRejectedValueOnce(processingError);

      await expect(
        processor.processEmailMessage(monitoredEmail, emailMessage)
      ).rejects.toThrow('Phishing detection failed');

      // Should not call alert services on error
      expect(mockInjectPhishingBanner).not.toHaveBeenCalled();
      expect(mockSendThreatAlert).not.toHaveBeenCalled();
    });


    it('should process email with all headers', async () => {
      emailMessage = { ...emailMessage, headers: {
        'from': 'sender@example.com',
        'to': 'monitored@example.com',
        'subject': 'Test Email',
        'in-reply-to': '<previous@example.com>'
      } };
      mockIsReplyOrForward.mockReturnValue(true);
      const threatAssessment: ThreatAssessment = {
        threatLevel: 'low',
        confidence: 10,
        detectedPatterns: [],
        riskFactors: [],
        recommendations: []
      };
      mockAnalyzeEmail.mockResolvedValueOnce(threatAssessment);

      await processor.processEmailMessage(monitoredEmail, emailMessage);

      expect(mockIsReplyOrForward).toHaveBeenCalledWith(emailMessage.headers);
      expect(mockAnalyzeEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: emailMessage.headers
        }),
        true,
        100
      );
    });
  });
});

