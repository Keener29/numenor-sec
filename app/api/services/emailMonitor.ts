import { query } from '../../db/connection.js';
import { phishingDetector, type EmailAnalysis } from './detector/phishingDetector.js';
import { emailService } from './emailService.js';
import { gmailOAuthService } from './oauth/gmail/GmailOAuthService.js';
import { monitoringLogger } from '../../utils/logger.js';
import { extractEmailAddress, isFromOwnService } from '../utils/emailUtils.js';
import type { ThreatAssessment } from '../types/email.js';
import type { DraftContentOptions } from './oauth/gmail/types.js';

interface MonitoredEmail {
  id: number;
  businessId: number;
  emailAddress: string;
  isConnected: boolean;
  lastChecked: Date | null;
}

interface EmailMessage {
  id: string;
  subject: string;
  body: string;
  sender: string;
  recipient: string;
  timestamp: Date;
  attachments?: string[];
  links?: string[];
  headers?: Record<string, string>;
  labels?: string[];
}

class EmailMonitor {
  private readonly PURGE_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
  private purgeInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize email monitoring service (event-driven, no polling)
   * Sets up periodic maintenance tasks
   */
  async initialize(): Promise<void> {
    monitoringLogger.info('Initializing email monitoring service (event-driven)', {
      operation: 'initialize-monitoring'
    });

    // Schedule periodic purge of processed_emails (twice a day)
    try {
      await this.purgeProcessedEmails(); // run once at startup
    } catch (e) {
      monitoringLogger.error('Initial purge of processed_emails failed', { operation: 'purge-initial' }, e as Error);
    }
    this.purgeInterval = setInterval(async () => {
      try {
        await this.purgeProcessedEmails();
      } catch (error) {
        monitoringLogger.error('Error during processed_emails purge', { operation: 'purge-interval' }, error as Error);
      }
    }, this.PURGE_INTERVAL_MS);

    monitoringLogger.info('Email monitoring service initialized successfully', {
      operation: 'initialize-monitoring'
    });
  }

  /**
   * Stop monitoring service (cleanup)
   */
  stopMonitoring(): void {
    if (this.purgeInterval) {
      clearInterval(this.purgeInterval);
      this.purgeInterval = null;
    }
    monitoringLogger.info('Email monitoring service stopped', {
      operation: 'stop-monitoring'
    });
  }

  /**
   * Process new emails from Gmail history (called by Pub/Sub webhook)
   */
  async processNewEmailsFromHistory(
    businessId: number,
    emailId: number,
    emailAddress: string,
    startHistoryId: string,
    endHistoryId: string
  ): Promise<void> {
    try {
      monitoringLogger.info('Processing new emails from history', {
        operation: 'process-new-emails-history',
        emailAddress,
        metadata: {
          startHistoryId,
          endHistoryId
        }
      });

      // Get message IDs from history
      const { messageIds, latestHistoryId } = await gmailOAuthService.listHistorySince(
        businessId,
        emailAddress,
        startHistoryId
      );

      if (messageIds.length === 0) {
        monitoringLogger.debug('No new messages in history', {
          operation: 'process-new-emails-history',
          emailAddress
        });
        return;
      }

      monitoringLogger.info('Found new messages in history', {
        operation: 'process-new-emails-history',
        emailAddress,
        metadata: {
          messageCount: messageIds.length
        }
      });

      // Fetch full message details
      const messages = await gmailOAuthService.getMessagesByIds(
        businessId,
        emailAddress,
        messageIds
      );

      // Create MonitoredEmail object
      const monitoredEmail: MonitoredEmail = {
        id: emailId,
        businessId,
        emailAddress,
        isConnected: true,
        lastChecked: null
      };

      const startTime = Date.now();
      let threatsFound = 0;
      let emailsProcessed = 0;

      // Process each message with deduplication
      for (const emailMessage of messages) {
        const seen = await this.isMessageProcessed(businessId, emailAddress, emailMessage.id);
        if (seen) {
          monitoringLogger.debug('Message already processed, skipping', {
            operation: 'process-new-emails-history',
            emailAddress,
            metadata: { messageId: emailMessage.id }
          });
          continue;
        }

        await this.processEmailMessage(monitoredEmail, emailMessage);
        await this.markMessageProcessed(businessId, emailAddress, emailMessage.id);
        emailsProcessed++;
        
        // Check if threat was detected (would be logged in processEmailMessage)
        // We'll count threats by checking if alert was created, but for now just track processed count
      }

      const scanDuration = Date.now() - startTime;

      // Log scan record for statistics
      await query(
        `INSERT INTO email_scans (business_id, email_id, scan_type, threats_found, emails_processed, scan_duration_ms, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [businessId, emailId, 'real_time', threatsFound, emailsProcessed, scanDuration, 'completed']
      );

      monitoringLogger.info('Successfully processed new emails from history', {
        operation: 'process-new-emails-history',
        emailAddress,
        metadata: {
          messagesProcessed: messages.length,
          emailsProcessed,
          scanDuration
        }
      });
    } catch (error) {
      monitoringLogger.error('Error processing new emails from history', {
        operation: 'process-new-emails-history',
        emailAddress
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Perform full sync fallback when historyId is too old
   */
  async performFullSyncFallback(
    businessId: number,
    emailId: number,
    emailAddress: string
  ): Promise<void> {
    try {
      monitoringLogger.info('Performing full sync fallback', {
        operation: 'full-sync-fallback',
        emailAddress
      });

      // Get OAuth connection timestamp
      const tokenResult = await query(
        'SELECT created_at FROM oauth_tokens WHERE business_id = $1 AND email_address = $2',
        [businessId, emailAddress]
      );

      if (tokenResult.rows.length === 0) {
        throw new Error('No OAuth tokens found for email');
      }

      const connectionTimestamp = (tokenResult.rows[0] as { created_at: Date }).created_at;

      // Fetch emails since connection
      const messages = await gmailOAuthService.fetchEmails(
        businessId,
        emailAddress,
        50,
        '',
        connectionTimestamp
      );

      // Filter out sent/draft/trash emails
      const filteredMessages = messages.filter(emailMessage => {
        const labels = emailMessage.labels || [];
        if (labels.includes('SENT') || labels.includes('DRAFT') || labels.includes('TRASH')) return false;
        if (emailMessage.sender === emailAddress) return false;
        return emailMessage.timestamp > connectionTimestamp;
      });

      monitoringLogger.info('Full sync fetched emails', {
        operation: 'full-sync-fallback',
        emailAddress,
        metadata: {
          totalFetched: messages.length,
          filtered: filteredMessages.length
        }
      });

      // Create MonitoredEmail object
      const monitoredEmail: MonitoredEmail = {
        id: emailId,
        businessId,
        emailAddress,
        isConnected: true,
        lastChecked: null
      };

      const startTime = Date.now();
      let threatsFound = 0;
      let emailsProcessed = 0;

      // Process each message with deduplication
      for (const emailMessage of filteredMessages) {
        const seen = await this.isMessageProcessed(businessId, emailAddress, emailMessage.id);
        if (seen) continue;

        await this.processEmailMessage(monitoredEmail, emailMessage);
        await this.markMessageProcessed(businessId, emailAddress, emailMessage.id);
        emailsProcessed++;
      }

      const scanDuration = Date.now() - startTime;

      // Log scan record for statistics
      await query(
        `INSERT INTO email_scans (business_id, email_id, scan_type, threats_found, emails_processed, scan_duration_ms, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
        [businessId, emailId, 'full_scan', threatsFound, emailsProcessed, scanDuration, 'completed']
      );

      monitoringLogger.info('Full sync fallback completed', {
        operation: 'full-sync-fallback',
        emailAddress,
        metadata: {
          messagesProcessed: filteredMessages.length,
          emailsProcessed,
          scanDuration
        }
      });
    } catch (error) {
      monitoringLogger.error('Error during full sync fallback', {
        operation: 'full-sync-fallback',
        emailAddress
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Process a single email message for phishing detection
   */
  private async processEmailMessage(
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
        await this.injectPhishingBannerIntoEmail(monitoredEmail, emailMessage, threatAssessment);

        // Store threat assessment for high/critical threats
        if (['high', 'critical'].includes(threatAssessment.threatLevel)) {
          await phishingDetector.storeThreatAssessment(
            monitoredEmail.businessId,
            monitoredEmail.id,
            threatAssessment,
            emailData
          );

          // Mark email as read in Gmail - only for detected phishing threats
          try {
            await gmailOAuthService.markAsRead(monitoredEmail.businessId, monitoredEmail.emailAddress, emailMessage.id);
            monitoringLogger.debug('Email marked as read after phishing detection', {
              operation: 'mark-phishing-email-read',
              emailAddress: monitoredEmail.emailAddress,
              metadata: {
                messageId: emailMessage.id,
                threatLevel: threatAssessment.threatLevel
              }
            });
          } catch (markError) {
            monitoringLogger.error('Error marking phishing email as read', {
              operation: 'mark-phishing-email-read',
              emailAddress: monitoredEmail.emailAddress,
              metadata: {
                messageId: emailMessage.id,
                threatLevel: threatAssessment.threatLevel
              }
            }, markError as Error);
            // Continue processing even if marking fails
          }

          await this.sendThreatAlert(monitoredEmail, emailMessage, threatAssessment);

          // Log security event
          await this.logSecurityEvent(
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
      } else {
        // For safe/low threat emails, log that they were not marked as read
        monitoringLogger.debug('Email not marked as read - no phishing threat detected', {
          operation: 'process-email-message',
          emailAddress: monitoredEmail.emailAddress,
          metadata: {
            messageId: emailMessage.id,
            threatLevel: threatAssessment.threatLevel,
            subject: emailMessage.subject
          }
        });
      }

    } catch (error) {
      monitoringLogger.error('Error processing email message', {
        operation: 'process-email-message',
        emailAddress: monitoredEmail.emailAddress
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Create draft email with phishing banner
   */
  private async injectPhishingBannerIntoEmail(
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


  private async isMessageProcessed(businessId: number, emailAddress: string, messageId: string): Promise<boolean> {
    const res = await query(
      'SELECT 1 FROM processed_emails WHERE business_id = $1 AND email_address = $2 AND message_id = $3',
      [businessId, emailAddress, messageId]
    );
    return res.rows.length > 0;
  }

  private async markMessageProcessed(businessId: number, emailAddress: string, messageId: string): Promise<void> {
    await query(
      `INSERT INTO processed_emails (business_id, email_address, message_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (business_id, email_address, message_id) DO NOTHING`,
      [businessId, emailAddress, messageId]
    );
  }


  private getProcessedRetentionHours(): number {
    const raw = process.env.PROCESSED_EMAIL_RETENTION_HOURS;
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isFinite(parsed) && parsed >= 24 && parsed <= 48) {
      return parsed;
    }
    return 48; // default to 2 days
  }

  private async purgeProcessedEmails(): Promise<void> {
    const hours = this.getProcessedRetentionHours();
    const intervalLiteral = `${hours} hours`;
    await query(
      `DELETE FROM processed_emails
       WHERE processed_at < NOW() - ($1)::interval`,
      [intervalLiteral]
    );
    monitoringLogger.debug('Purged old processed_emails rows', {
      operation: 'purge-processed-emails',
      metadata: { retentionHours: hours }
    });
  }

  /**
   * Send threat alert notification
   */
  private async sendThreatAlert(
    monitoredEmail: MonitoredEmail,
    emailMessage: EmailMessage,
    threatAssessment: any
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

      const businessOwner = businessResult.rows[0] as { email: string; name: string };
      const businessName = businessOwner.name;
      const ownerEmail = businessOwner.email;

      // Send threat alert email
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


  /**
   * Log security event
   */
  private async logSecurityEvent(
    businessId: number,
    eventType: string,
    description: string,
    metadata?: any
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO security_events (business_id, event_type, description, metadata, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [businessId, eventType, description, metadata ? JSON.stringify(metadata) : null]
      );
    } catch (error) {
      monitoringLogger.error('Failed to log security event', {
        operation: 'log-security-event',
        metadata: {
          businessId,
          eventType
        }
      }, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get monitoring status (event-driven, no polling)
   */
  getMonitoringStatus(): { isMonitoring: boolean; mode: string } {
    return {
      isMonitoring: true, // Always active in event-driven mode
      mode: 'event-driven'
    };
  }

  /**
   * Manually trigger email sync for a specific business (fallback method)
   */
  async triggerBusinessScan(businessId: number): Promise<void> {
    try {
      const businessEmails = await query(
        `SELECT me.id, me.business_id, me.email_address
         FROM monitored_emails me
         INNER JOIN oauth_tokens ot ON me.business_id = ot.business_id AND me.email_address = ot.email_address
         WHERE me.business_id = $1`,
        [businessId]
      );

      if (businessEmails.rows.length === 0) {
        monitoringLogger.info('No connected emails found for business', {
          operation: 'trigger-business-scan',
          businessId
        });
        return;
      }

      monitoringLogger.info('Manually syncing emails for business', {
        operation: 'trigger-business-scan',
        businessId,
        metadata: {
          emailCount: businessEmails.rows.length
        }
      });

      for (const emailRow of businessEmails.rows) {
        const row = emailRow as { id: number; business_id: number; email_address: string };
        await this.performFullSyncFallback(row.business_id, row.id, row.email_address);
      }

    } catch (error) {
      monitoringLogger.error('Error during manual scan for business', {
        operation: 'trigger-business-scan',
        businessId
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Get monitoring statistics
   */
  async getMonitoringStats(): Promise<any> {
    try {
      const stats = await query(
        `SELECT 
          COUNT(*) as total_emails,
          COUNT(CASE WHEN ot.id IS NOT NULL THEN 1 END) as connected_emails,
          COUNT(CASE WHEN ot.id IS NULL THEN 1 END) as disconnected_emails,
          COUNT(CASE WHEN me.last_checked > NOW() - INTERVAL '1 hour' THEN 1 END) as recently_checked
         FROM monitored_emails me
         LEFT JOIN oauth_tokens ot ON me.business_id = ot.business_id AND me.email_address = ot.email_address`,
        []
      );

      const scanStats = await query(
        `SELECT 
          COUNT(*) as total_scans,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_scans,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_scans,
         FROM email_scans 
         WHERE created_at > NOW() - INTERVAL '24 hours'`,
        []
      );

      // Handle empty data gracefully
      const emailStats = (stats.rows[0] as { total_emails: number; connected_emails: number; disconnected_emails: number; recently_checked: number }) || {
        total_emails: 0,
        connected_emails: 0,
        disconnected_emails: 0,
        recently_checked: 0
      };

      const scanStatsData = (scanStats.rows[0] as { total_scans: number; successful_scans: number; failed_scans: number }) || {
        total_scans: 0,
        successful_scans: 0,
        failed_scans: 0
      };

      return {
        emails: emailStats,
        scans: scanStatsData
      };
    } catch (error) {
      monitoringLogger.error('Failed to get monitoring stats', {
        operation: 'get-monitoring-stats'
      }, error instanceof Error ? error : new Error(String(error)));
      // Return default values instead of throwing
      return {
        emails: {
          total_emails: 0,
          connected_emails: 0,
          disconnected_emails: 0,
          recently_checked: 0
        },
        scans: {
          total_scans: 0,
          successful_scans: 0,
          failed_scans: 0
        }
      };
    }
  }
}

export const emailMonitor = new EmailMonitor();
export type { MonitoredEmail, EmailMessage };
