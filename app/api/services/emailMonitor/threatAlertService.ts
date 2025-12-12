import { query } from '../../../db/connection.js';
import { emailService } from '../emailService.js';
import { gmailOAuthService } from '../oauth/gmail/GmailOAuthService.js';
import { monitoringLogger } from '../../../utils/logger.js';
import type { ThreatAssessment } from '../../types/email.js';
import type { DraftContentOptions } from '../oauth/gmail/types.js';
import type { MonitoredEmail, EmailMessage } from './types.js';

/**
 * Service for handling threat alerts and phishing banner injection
 */
export class ThreatAlertService {
  /**
   * Create draft email with phishing banner
   */
  async injectPhishingBannerIntoEmail(
    monitoredEmail: MonitoredEmail,
    emailMessage: EmailMessage,
    threatAssessment: ThreatAssessment
  ): Promise<void> {
    // Generate reason string from threat assessment
    const reasonParts: string[] = [];
    if (threatAssessment.authenticationResults && threatAssessment.authenticationResults.overall !== 'pass') {
      reasonParts.push(`Authentication overall results: ${threatAssessment.authenticationResults.overall}`);
    }
    else if (threatAssessment.detectedPatterns.length > 0) {
      reasonParts.push(threatAssessment.detectedPatterns.slice(0, 2).join(', ').replaceAll('_', ' '));
    }
    if (threatAssessment.riskFactors.length > 0 && reasonParts.length === 0) {
      reasonParts.push(threatAssessment.riskFactors[0]);
    }
    const reason = reasonParts.length > 0
      ? reasonParts.join('; ')
      : `${threatAssessment.threatLevel} threat level detected`;

    try {
      // Get full Gmail message for threadId (needed to link draft to original thread)
      const fullGmailMessage = await gmailOAuthService.getFullMessage(
        monitoredEmail.businessId,
        monitoredEmail.emailAddress,
        emailMessage.id
      );

      // Generate banner HTML
      const riskLabel = threatAssessment.threatLevel.charAt(0).toUpperCase() + threatAssessment.threatLevel.slice(1);
      const riskStyles = {
        medium: { background: '#fff4cc', borderColor: '#f7c948', textColor: '#664d03' },
        high: { background: '#fff1e0', borderColor: '#ff9f43', textColor: '#6b3b00' },
        critical: { background: '#ffecec', borderColor: '#ff3b30', textColor: '#6b0b0b' }
      };
      const style = riskStyles[threatAssessment.threatLevel as 'medium' | 'high' | 'critical'];
      const sanitizedReason = reason.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

      const bannerHtml = `
        <div role="alert" style="background-color: ${style.background}; border-left: 4px solid ${style.borderColor}; color: ${style.textColor}; padding: 12px 16px; margin: 0 0 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.5; max-width: 100%; box-sizing: border-box;">
          <div style="font-weight: bold; margin-bottom: 8px; font-size: 15px;">
            ⚠️ ${riskLabel.toUpperCase()} RISK
          </div>
          <div style="margin-bottom: 8px;">
            Reasons: ${sanitizedReason}. Do not click links or download attachments. Verify the sender before responding.
          </div>
          <div style="font-size: 11px; color: ${style.textColor}; opacity: 0.8; margin-top: 8px;">
            Numenor Security  -  Automated warning
          </div>
        </div>
      `;

      // Generate plain-text warning
      let scoreText = "";
      if (threatAssessment.confidence != null) {
        scoreText = `. Score: ${threatAssessment.confidence}`;
      }

      const plainWarning =
        "WARNING [" +
        riskLabel.toUpperCase() +
        " RISK]  -  " +
        reason +
        scoreText +
        "\n\n";
      // Create draft email with banner
      const draftContentOptions: DraftContentOptions = {
        businessId: monitoredEmail.businessId,
        emailAddress: monitoredEmail.emailAddress,
        originalMessage: fullGmailMessage,
        modifiedHtml: bannerHtml,
        modifiedPlainText: plainWarning,
        subject: `Fwd: ${emailMessage.subject}`,
        from: monitoredEmail.emailAddress,
        to: emailMessage.sender
      };
      const draftId = await gmailOAuthService.createDraftWithContent(draftContentOptions);

      monitoringLogger.info('Draft created with phishing banner', {
        operation: 'inject-phishing-banner',
        emailAddress: monitoredEmail.emailAddress,
        metadata: {
          messageId: emailMessage.id,
          draftId,
          threatLevel: threatAssessment.threatLevel,
          confidence: threatAssessment.confidence
        }
      });
    } catch (error) {
      monitoringLogger.error('Failed to create draft with phishing banner', {
        operation: 'inject-phishing-banner',
        emailAddress: monitoredEmail.emailAddress,
        metadata: {
          messageId: emailMessage.id,
          threatLevel: threatAssessment.threatLevel
        }
      }, error as Error);
      // Continue processing even if draft creation fails
    }
  }

  /**
   * Send threat alert notification to business owner
   * This is a wrapper around emailService.sendThreatAlert() that handles:
   * - Looking up business owner information from the database
   * - Monitoring-specific logging
   * 
   * The actual email sending is handled by emailService.sendThreatAlert()
   */
  async sendThreatAlert(
    monitoredEmail: MonitoredEmail,
    emailMessage: EmailMessage,
    threatAssessment: ThreatAssessment
  ): Promise<void> {
    try {
      // Get business owner email
      const businessResult = await query(
        `SELECT u.email, b.business_name 
         FROM users u 
         JOIN businesses b ON u.id = b.owner_id 
         WHERE b.id = $1`,
        [monitoredEmail.businessId]
      );

      if (businessResult.rows.length === 0) {
        monitoringLogger.error('Business owner not found for threat alert', {
          operation: 'send-threat-alert',
          businessId: monitoredEmail.businessId
        });
        return;
      }

      const businessOwner = businessResult.rows[0] as { email: string; business_name: string };
      const businessName = businessOwner.business_name;
      const ownerEmail = businessOwner.email;

      // Delegate to emailService for actual email sending
      await emailService.sendThreatAlert(
        businessName,
        ownerEmail,
        monitoredEmail.emailAddress,
        emailMessage,
        threatAssessment
      );

      monitoringLogger.info('Threat alert sent successfully', {
        operation: 'send-threat-alert',
        emailAddress: monitoredEmail.emailAddress,
        metadata: {
          ownerEmail,
          threatLevel: threatAssessment.threatLevel
        }
      });

    } catch (error) {
      monitoringLogger.error('Failed to send threat alert', {
        operation: 'send-threat-alert',
        emailAddress: monitoredEmail.emailAddress
      }, error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const threatAlertService = new ThreatAlertService();
