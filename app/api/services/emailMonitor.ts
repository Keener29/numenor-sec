import { query } from '../../db/connection.js';
import { phishingDetector, type EmailAnalysis } from './detector/phishingDetector.js';
import { emailService } from './emailService.js';
import { gmailOAuthService } from './oauth/gmail/GmailOAuthService.js';
import { monitoringLogger } from './logger.js';
import { isFromOwnService } from '../utils/emailUtils.js';

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
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private readonly MIN_POLL_MS = 60000; // 60s
  private readonly MAX_POLL_MS = 120000; // 120s
  private readonly BATCH_SIZE = 10;
  private readonly PURGE_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
  private purgeInterval: NodeJS.Timeout | null = null;

  /**
   * Start monitoring all connected email addresses
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      monitoringLogger.info('Email monitoring is already running', {
        operation: 'start-monitoring'
      });
      return;
    }

    monitoringLogger.info('Starting email monitoring service', {
      operation: 'start-monitoring'
    });
    this.isMonitoring = true;

    // Initial scan
    await this.performEmailScan();

    // Jittered timeout loop instead of fixed interval
    const scheduleNext = () => {
      const delay = this.randomBetween(this.MIN_POLL_MS, this.MAX_POLL_MS);
      this.monitoringInterval = setTimeout(async () => {
        try {
          await this.performEmailScan();
        } catch (error) {
          monitoringLogger.error('Error during email monitoring', {
            operation: 'monitoring-timeout'
          }, error instanceof Error ? error : new Error(String(error)));
        } finally {
          if (this.isMonitoring) scheduleNext();
        }
      }, delay) as unknown as NodeJS.Timeout;
    };

    scheduleNext();

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

    monitoringLogger.info('Email monitoring service started successfully', {
      operation: 'start-monitoring'
    });
  }

  /**
   * Stop monitoring service
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearTimeout(this.monitoringInterval as unknown as NodeJS.Timeout);
      this.monitoringInterval = null;
    }
    if (this.purgeInterval) {
      clearInterval(this.purgeInterval);
      this.purgeInterval = null;
    }
    this.isMonitoring = false;
    monitoringLogger.info('Email monitoring service stopped', {
      operation: 'stop-monitoring'
    });
  }

  /**
   * Perform a complete email scan across all connected addresses
   */
  private async performEmailScan(): Promise<void> {
    try {
      const connectedEmails = await this.getConnectedEmails();
      
      if (connectedEmails.length === 0) {
        monitoringLogger.info('No connected emails to monitor', {
          operation: 'email-scan'
        });
        return;
      }

      monitoringLogger.info('Scanning connected email addresses', {
        operation: 'email-scan',
        metadata: {
          emailCount: connectedEmails.length
        }
      });

      // Process emails in batches to avoid overwhelming the system
      for (let i = 0; i < connectedEmails.length; i += this.BATCH_SIZE) {
        const batch = connectedEmails.slice(i, i + this.BATCH_SIZE);
        await Promise.all(batch.map(email => this.scanEmailAddress(email)));
      }

      // Log scan completion
      await this.logScanCompletion(connectedEmails.length);
      
    } catch (error) {
      monitoringLogger.error('Error during email scan', {
        operation: 'email-scan'
      }, error instanceof Error ? error : new Error(String(error)));
      await this.logScanError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get all connected email addresses that need monitoring
   */
  private async getConnectedEmails(): Promise<MonitoredEmail[]> {
    try {
      // Get emails that have OAuth tokens (actually connected)
      const result = await query(
        `SELECT me.id, me.business_id, me.email_address, me.last_checked
         FROM monitored_emails me
         INNER JOIN oauth_tokens ot ON me.business_id = ot.business_id AND me.email_address = ot.email_address
         ORDER BY me.last_checked ASC NULLS FIRST`,
        []
      );

      return (result.rows as { id: number; business_id: number; email_address: string; last_checked: Date | null }[]).map((row) => ({
        id: row.id,
        businessId: row.business_id,
        emailAddress: row.email_address,
        isConnected: true, // If OAuth tokens exist, email is connected
        lastChecked: row.last_checked
      }));
    } catch (error) {
      monitoringLogger.error('Failed to get connected emails', {
        operation: 'get-connected-emails'
      }, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Scan a specific email address for new messages
   */
  private async scanEmailAddress(email: MonitoredEmail): Promise<void> {
    try {
      monitoringLogger.debug('Scanning email address', {
        operation: 'scan-email-address',
        emailAddress: email.emailAddress
      });

      const { emails: newEmails, nextHistoryId } = await this.fetchNewEmails(email);

      if (newEmails.length === 0) {
        monitoringLogger.debug('No new emails found', {
          operation: 'scan-email-address',
          emailAddress: email.emailAddress
        });
        return;
      }

      monitoringLogger.info('Found new emails', {
        operation: 'scan-email-address',
        emailAddress: email.emailAddress,
        metadata: {
          emailCount: newEmails.length
        }
      });

      // Process each new email with deduplication
      for (const emailMessage of newEmails) {
        const seen = await this.isMessageProcessed(email.businessId, email.emailAddress, emailMessage.id);
        if (seen) continue;
        await this.processEmailMessage(email, emailMessage);
        await this.markMessageProcessed(email.businessId, email.emailAddress, emailMessage.id);
      }

      // Update last checked timestamp and persist next history anchor
      await this.updateLastChecked(email.id);
      if (nextHistoryId) {
        await this.setLastHistoryId(email.businessId, email.emailAddress, nextHistoryId);
      }

    } catch (error) {
      monitoringLogger.error('Error scanning email address', {
        operation: 'scan-email-address',
        emailAddress: email.emailAddress
      }, error instanceof Error ? error : new Error(String(error)));
      await this.logEmailScanError(email.id, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Fetch new emails for a monitored address using Gmail API
   */
  private async fetchNewEmails(email: MonitoredEmail): Promise<{ emails: EmailMessage[]; nextHistoryId?: string }> {
    try {
      // Check if OAuth tokens exist for this email and get connection timestamp
      const tokenResult = await query(
        'SELECT id, created_at FROM oauth_tokens WHERE business_id = $1 AND email_address = $2',
        [email.businessId, email.emailAddress]
      );

      if (tokenResult.rows.length === 0) {
        monitoringLogger.debug('No OAuth tokens found, skipping Gmail fetch', {
          operation: 'fetch-new-emails',
          emailAddress: email.emailAddress
        });
        return { emails: [] };
      }

      // Get the OAuth connection timestamp to only fetch emails after connection
      const connectionTimestamp = (tokenResult.rows[0] as { created_at: Date }).created_at;

      // Use the most recent timestamp: either last check or OAuth connection
      // This creates a time window to avoid reprocessing the same emails
      let timestampToUse = connectionTimestamp;
      
      if (email.lastChecked) {
        // Use the more recent timestamp to avoid reprocessing emails from previous scans
        timestampToUse = email.lastChecked > connectionTimestamp ? email.lastChecked : connectionTimestamp;
        
        monitoringLogger.debug('Fetching emails after last check time', {
          operation: 'fetch-new-emails',
          emailAddress: email.emailAddress,
          metadata: {
            lastChecked: email.lastChecked.toISOString(),
            connectionTimestamp: connectionTimestamp.toISOString(),
            timestampToUse: timestampToUse.toISOString()
          }
        });
      } else {
        monitoringLogger.debug('Fetching emails after OAuth connection time (first scan)', {
          operation: 'fetch-new-emails',
          emailAddress: email.emailAddress,
          metadata: {
            connectionTimestamp: connectionTimestamp.toISOString()
          }
        });
      }

      // Fetch emails from Gmail API (only emails after the timestamp window)
      // Note: Gmail's after: filter only works with dates, not times, so we need to filter by timestamp client-side
      // Try history-based delta first using stored offset
      const existingOffset = await this.getLastHistoryId(email.businessId, email.emailAddress);
      try {
        if (existingOffset) {
          const { messageIds, latestHistoryId } = await gmailOAuthService.listHistorySince(
            email.businessId,
            email.emailAddress,
            existingOffset
          );

          if (messageIds.length === 0) {
            return { emails: [], nextHistoryId: latestHistoryId };
          }

          const messages = await gmailOAuthService.getMessagesByIds(
            email.businessId,
            email.emailAddress,
            messageIds
          );

          // Apply client-side safety filters
          const filtered = messages.filter(emailMessage => {
            const emailTimestamp = emailMessage.timestamp.getTime();
            const cutoffTimestamp = timestampToUse.getTime();
            const labels = emailMessage.labels || [];
            if (labels.includes('SENT') || labels.includes('DRAFT') || labels.includes('TRASH')) return false;
            if (emailMessage.sender === email.emailAddress) return false;
            return emailTimestamp > cutoffTimestamp;
          });

          monitoringLogger.debug(`History delta: ${messageIds.length} ids, ${filtered.length} after filters`, {
            operation: 'fetch-new-emails',
            emailAddress: email.emailAddress
          });

          return { emails: filtered, nextHistoryId: latestHistoryId };
        }
      } catch (historyError) {
        if ((historyError as any)?.causeCode === 'HISTORY_TOO_OLD') {
          monitoringLogger.warn('History anchor too old, performing bounded resync', {
            operation: 'fetch-new-emails',
            emailAddress: email.emailAddress
          });
        } else {
          throw historyError;
        }
      }

      // Initial sync or bounded resync fallback: use timestamp-based fetch
      const gmailMessages = await gmailOAuthService.fetchEmails(
        email.businessId,
        email.emailAddress,
        50,
        '',
        timestampToUse
      );

      const filteredEmails = gmailMessages.filter(emailMessage => {
        const emailTimestamp = emailMessage.timestamp.getTime();
        const cutoffTimestamp = timestampToUse.getTime();
        const labels = emailMessage.labels || [];
        if (labels.includes('SENT') || labels.includes('DRAFT') || labels.includes('TRASH')) return false;
        if (emailMessage.sender === (email.emailAddress)) return false;
        return emailTimestamp > cutoffTimestamp;
      });

      monitoringLogger.debug(`Fallback fetch: ${gmailMessages.length} fetched, ${filteredEmails.length} after ${timestampToUse.toISOString()}`, {
        operation: 'fetch-new-emails',
        emailAddress: email.emailAddress
      });

      const currentHistoryId = await gmailOAuthService.getCurrentHistoryId(email.businessId, email.emailAddress);
      return { emails: filteredEmails, nextHistoryId: currentHistoryId };

    } catch (error) {
      monitoringLogger.error('Error fetching emails from Gmail', {
        operation: 'fetch-new-emails',
        emailAddress: email.emailAddress
      }, error instanceof Error ? error : new Error(String(error)));
      
      // If OAuth fails, return empty results
      monitoringLogger.warn('OAuth failed, returning empty results', {
        operation: 'fetch-new-emails',
        emailAddress: email.emailAddress
      });
      return { emails: [] };
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

      // Skip analysis for emails from our own service (localhost, 127.0.0.1, etc.)
      if (isFromOwnService(emailMessage.sender)) {
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
        sender: emailMessage.sender,
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

      // Store threat assessment if threat level is medium or higher
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

  private async getLastHistoryId(businessId: number, emailAddress: string): Promise<string | null> {
    const res = await query(
      'SELECT last_history_id FROM email_offsets WHERE business_id = $1 AND email_address = $2 AND provider = $3',
      [businessId, emailAddress, 'gmail']
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0] as { last_history_id: string | null };
    return row.last_history_id || null;
  }

  private async setLastHistoryId(businessId: number, emailAddress: string, historyId: string): Promise<void> {
    await query(
      `INSERT INTO email_offsets (business_id, email_address, provider, last_history_id, last_synced_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (business_id, email_address, provider)
       DO UPDATE SET last_history_id = EXCLUDED.last_history_id, last_synced_at = CURRENT_TIMESTAMP`,
      [businessId, emailAddress, 'gmail', historyId]
    );
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

  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private getProcessedRetentionHours(): number {
    const raw = process.env.PROCESSED_EMAIL_RETENTION_HOURS;
    const parsed = raw ? parseInt(raw, 10) : NaN;
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
        `SELECT u.email, b.name 
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
   * Update last checked timestamp for an email
   */
  private async updateLastChecked(emailId: number): Promise<void> {
    try {
      await query(
        'UPDATE monitored_emails SET last_checked = CURRENT_TIMESTAMP WHERE id = $1',
        [emailId]
      );
    } catch (error) {
      monitoringLogger.error('Failed to update last checked timestamp', {
        operation: 'update-last-checked',
        metadata: {
          emailId
        }
      }, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Log scan completion
   */
  private async logScanCompletion(emailCount: number): Promise<void> {
    try {
      await query(
        `INSERT INTO email_scans (business_id, email_id, scan_type, emails_processed, status, created_at)
         VALUES (NULL, NULL, 'full_scan', $1, 'completed', CURRENT_TIMESTAMP)`,
        [emailCount]
      );
    } catch (error) {
      monitoringLogger.error('Failed to log scan completion', {
        operation: 'log-scan-completion'
      }, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Log scan error
   */
  private async logScanError(error: Error): Promise<void> {
    try {
      await query(
        `INSERT INTO email_scans (business_id, email_id, scan_type, status, error_message, created_at)
         VALUES (NULL, NULL, 'full_scan', 'failed', $1, CURRENT_TIMESTAMP)`,
        [error.message || 'Unknown error']
      );
    } catch (logError) {
      monitoringLogger.error('Failed to log scan error', {
        operation: 'log-scan-error'
      }, logError as Error);
    }
  }

  /**
   * Log email scan error
   */
  private async logEmailScanError(emailId: number, error: Error): Promise<void> {
    try {
      await query(
        `INSERT INTO email_scans (business_id, email_id, scan_type, status, error_message, created_at)
         VALUES (NULL, $1, 'email_scan', 'failed', $2, CURRENT_TIMESTAMP)`,
        [emailId, error.message || 'Unknown error']
      );
    } catch (logError) {
      monitoringLogger.error('Failed to log email scan error', {
        operation: 'log-email-scan-error',
        metadata: {
          emailId
        }
      }, logError as Error);
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
   * Get monitoring status
   */
  getMonitoringStatus(): { isMonitoring: boolean; interval: number } {
    return {
      isMonitoring: this.isMonitoring,
      interval: this.MAX_POLL_MS
    };
  }

  /**
   * Manually trigger email scan for a specific business
   */
  async triggerBusinessScan(businessId: number): Promise<void> {
    try {
      const businessEmails = await query(
        `SELECT me.id, me.business_id, me.email_address, me.last_checked
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

      monitoringLogger.info('Manually scanning emails for business', {
        operation: 'trigger-business-scan',
        businessId,
        metadata: {
          emailCount: businessEmails.rows.length
        }
      });

      for (const emailRow of businessEmails.rows) {
        const row = emailRow as { id: number; business_id: number; email_address: string; last_checked: Date | null };
        const email: MonitoredEmail = {
          id: row.id,
          businessId: row.business_id,
          emailAddress: row.email_address,
          isConnected: true, // If OAuth tokens exist, email is connected
          lastChecked: row.last_checked
        };

        await this.scanEmailAddress(email);
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
          AVG(emails_processed) as avg_emails_per_scan
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

      const scanStatsData = (scanStats.rows[0] as { total_scans: number; successful_scans: number; failed_scans: number; avg_emails_per_scan: number }) || {
        total_scans: 0,
        successful_scans: 0,
        failed_scans: 0,
        avg_emails_per_scan: 0
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
          failed_scans: 0,
          avg_emails_per_scan: 0
        }
      };
    }
  }
}

export const emailMonitor = new EmailMonitor();
export type { MonitoredEmail, EmailMessage };
