import { phishingDetector, type EmailAnalysis } from '../detector/phishingDetector.js';
import { monitoringLogger } from '../../../utils/logger.js';
import { extractEmailAddress, isFromOwnService } from '../../utils/emailUtils.js';
import { securityEventLogger } from '../../utils/securityEventLogger.js';
import { threatAlertService } from './threatAlertService.js';
import type { MonitoredEmail, EmailMessage } from './types.js';

/**
 * Service for processing individual email messages for phishing detection
 */
export class EmailProcessor {
  /**
   * Process a single email message for phishing detection
   */
  async processEmailMessage(
    monitoredEmail: MonitoredEmail,
    emailMessage: EmailMessage
  ): Promise<void> {
    try {
      monitoringLogger.debug('Processing email message', {
        operation: 'process-email-message',
        emailAddress: monitoredEmail.emailAddress,
        metadata: {
          subject: emailMessage.subject,
          sender: emailMessage.sender
        }
      });
      const emailAddress = extractEmailAddress(emailMessage.sender);
      // Skip analysis for emails from our own service (localhost, 127.0.0.1, etc.)
      if (isFromOwnService(emailAddress)) {
        monitoringLogger.debug('Skipping analysis for email from own service', {
          operation: 'process-email-message',
          emailAddress: monitoredEmail.emailAddress,
          sender: emailMessage.sender,
          metadata: {
            subject: emailMessage.subject
          }
        });
        return;
      }

      // Prepare email data for analysis
      const emailData: EmailAnalysis = {
        subject: emailMessage.subject,
        body: emailMessage.body,
        sender: emailAddress || '',
        recipient: emailMessage.recipient,
        attachments: emailMessage.attachments,
        links: emailMessage.links,
        headers: emailMessage.headers
      };

      // Analyze email for phishing threats
      const threatAssessment = await phishingDetector.analyzeEmail(emailData, monitoredEmail.businessId);

      monitoringLogger.info('Threat assessment completed', {
        operation: 'process-email-message',
        emailAddress: monitoredEmail.emailAddress,
        sender: emailMessage.sender,
        metadata: {
          threatLevel: threatAssessment.threatLevel,
          confidence: threatAssessment.confidence,
          subject: emailMessage.subject
        }
      });

      if (['high', 'critical'].includes(threatAssessment.threatLevel)) {
        await threatAlertService.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

        // Store threat assessment for high/critical threats
        if (['high', 'critical'].includes(threatAssessment.threatLevel)) {
          await phishingDetector.storeThreatAssessment(
            monitoredEmail.businessId,
            monitoredEmail.id,
            threatAssessment,
            emailData
          );

          await threatAlertService.sendThreatAlert(monitoredEmail, emailMessage, threatAssessment);

          // Log security event
          await securityEventLogger.logSecurityEvent(
            monitoredEmail.businessId,
            'phishing_detected',
            `Phishing attempt detected: ${threatAssessment.threatLevel} threat level`,
            {
              emailId: monitoredEmail.id,
              emailAddress: monitoredEmail.emailAddress,
              threatLevel: threatAssessment.threatLevel,
              confidence: threatAssessment.confidence,
              patterns: threatAssessment.detectedPatterns
            }
          );
        }
      }

    } catch (error) {
      monitoringLogger.error('Error processing email message', {
        operation: 'process-email-message',
        emailAddress: monitoredEmail.emailAddress
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}

export const emailProcessor = new EmailProcessor();
