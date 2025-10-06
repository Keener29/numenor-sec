import { query } from '../../db/connection.js';
import { phishingDetector, type EmailAnalysis } from './phishingDetector.js';
import { emailService } from '../utils/emailService.js';

interface MonitoredEmail {
  id: number;
  businessId: number;
  emailAddress: string;
  isConnected: boolean;
  lastChecked: Date;
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
}

class EmailMonitor {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private readonly SCAN_INTERVAL = 30000; // 30 seconds
  private readonly BATCH_SIZE = 10;

  /**
   * Start monitoring all connected email addresses
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('Email monitoring is already running');
      return;
    }

    console.log('Starting email monitoring service...');
    this.isMonitoring = true;

    // Initial scan
    await this.performEmailScan();

    // Set up interval for continuous monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performEmailScan();
      } catch (error) {
        console.error('Error during email monitoring:', error);
      }
    }, this.SCAN_INTERVAL);

    console.log('Email monitoring service started successfully');
  }

  /**
   * Stop monitoring service
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('Email monitoring service stopped');
  }

  /**
   * Perform a complete email scan across all connected addresses
   */
  private async performEmailScan(): Promise<void> {
    try {
      const connectedEmails = await this.getConnectedEmails();
      
      if (connectedEmails.length === 0) {
        console.log('No connected emails to monitor');
        return;
      }

      console.log(`Scanning ${connectedEmails.length} connected email addresses...`);

      // Process emails in batches to avoid overwhelming the system
      for (let i = 0; i < connectedEmails.length; i += this.BATCH_SIZE) {
        const batch = connectedEmails.slice(i, i + this.BATCH_SIZE);
        await Promise.all(batch.map(email => this.scanEmailAddress(email)));
      }

      // Log scan completion
      await this.logScanCompletion(connectedEmails.length);
      
    } catch (error) {
      console.error('Error during email scan:', error);
      await this.logScanError(error);
    }
  }

  /**
   * Get all connected email addresses that need monitoring
   */
  private async getConnectedEmails(): Promise<MonitoredEmail[]> {
    try {
      const result = await query(
        `SELECT id, business_id, email_address, is_connected, last_checked
         FROM monitored_emails 
         WHERE is_connected = true
         ORDER BY last_checked ASC NULLS FIRST`,
        []
      );

      return result.rows.map((row: any) => ({
        id: row.id,
        businessId: row.business_id,
        emailAddress: row.email_address,
        isConnected: row.is_connected,
        lastChecked: row.last_checked
      }));
    } catch (error) {
      console.error('Failed to get connected emails:', error);
      throw error;
    }
  }

  /**
   * Scan a specific email address for new messages
   */
  private async scanEmailAddress(email: MonitoredEmail): Promise<void> {
    try {
      console.log(`Scanning email: ${email.emailAddress}`);

      // Simulate email fetching (in a real implementation, this would connect to IMAP/POP3)
      const newEmails = await this.fetchNewEmails(email);

      if (newEmails.length === 0) {
        console.log(`No new emails for ${email.emailAddress}`);
        return;
      }

      console.log(`Found ${newEmails.length} new emails for ${email.emailAddress}`);

      // Process each new email
      for (const emailMessage of newEmails) {
        await this.processEmailMessage(email, emailMessage);
      }

      // Update last checked timestamp
      await this.updateLastChecked(email.id);

    } catch (error) {
      console.error(`Error scanning email ${email.emailAddress}:`, error);
      await this.logEmailScanError(email.id, error);
    }
  }

  /**
   * Simulate fetching new emails for a monitored address
   */
  private async fetchNewEmails(email: MonitoredEmail): Promise<EmailMessage[]> {
    // Simulate email fetching with random chance of finding emails
    const shouldHaveEmails = Math.random() < 0.3; // 30% chance of having new emails
    
    if (!shouldHaveEmails) {
      console.log(`No new emails simulated for ${email.emailAddress}`);
      return [];
    }

    // Generate 1-3 simulated emails
    const emailCount = Math.floor(Math.random() * 3) + 1;
    const emails: EmailMessage[] = [];

    for (let i = 0; i < emailCount; i++) {
      const isPhishing = Math.random() < 0.2; // 20% chance of phishing
      
      const emailMessage: EmailMessage = {
        id: `sim_${email.id}_${Date.now()}_${i}`,
        subject: isPhishing ? 
          'Urgent: Verify Your Account Immediately' : 
          'Meeting Reminder for Tomorrow',
        body: isPhishing ?
          'Click here to verify your account: https://fake-bank-security.com/verify' :
          'Don\'t forget about our meeting tomorrow at 2 PM.',
        sender: isPhishing ? 
          'security@fake-bank.com' : 
          'colleague@company.com',
        recipient: email.emailAddress,
        timestamp: new Date(),
        links: isPhishing ? ['https://fake-bank-security.com/verify'] : [],
        headers: {
          'from': isPhishing ? 'security@fake-bank.com' : 'colleague@company.com',
          'to': email.emailAddress,
          'subject': isPhishing ? 'Urgent: Verify Your Account Immediately' : 'Meeting Reminder for Tomorrow'
        }
      };

      emails.push(emailMessage);
    }

    console.log(`Simulated ${emails.length} new emails for ${email.emailAddress}`);
    return emails;
  }

  /**
   * Process a single email message for phishing detection
   */
  private async processEmailMessage(
    monitoredEmail: MonitoredEmail, 
    emailMessage: EmailMessage
  ): Promise<void> {
    try {
      console.log(`Processing email: ${emailMessage.subject}`);

      // Prepare email data for analysis
      const emailData: EmailAnalysis = {
        subject: emailMessage.subject,
        body: emailMessage.body,
        sender: emailMessage.sender,
        recipient: emailMessage.recipient,
        attachments: emailMessage.attachments,
        links: emailMessage.links
      };

      // Analyze email for phishing threats
      const threatAssessment = await phishingDetector.analyzeEmail(emailData);

      console.log(`Threat assessment: ${threatAssessment.threatLevel} (${threatAssessment.confidence}% confidence)`);

      // Store threat assessment if threat level is medium or higher
      if (['medium', 'high', 'critical'].includes(threatAssessment.threatLevel)) {
        await phishingDetector.storeThreatAssessment(
          monitoredEmail.businessId,
          monitoredEmail.id,
          threatAssessment,
          emailData
        );

        // Send alert notification for high/critical threats
        if (['high', 'critical'].includes(threatAssessment.threatLevel)) {
          await this.sendThreatAlert(monitoredEmail, emailMessage, threatAssessment);
        }

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

    } catch (error) {
      console.error('Error processing email message:', error);
      throw error;
    }
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
        console.error('Business owner not found for threat alert');
        return;
      }

      const businessOwner = businessResult.rows[0];
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

      console.log(`Threat alert sent to ${ownerEmail}`);

    } catch (error) {
      console.error('Failed to send threat alert:', error);
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
      console.error('Failed to update last checked timestamp:', error);
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
      console.error('Failed to log scan completion:', error);
    }
  }

  /**
   * Log scan error
   */
  private async logScanError(error: any): Promise<void> {
    try {
      await query(
        `INSERT INTO email_scans (business_id, email_id, scan_type, status, error_message, created_at)
         VALUES (NULL, NULL, 'full_scan', 'failed', $1, CURRENT_TIMESTAMP)`,
        [error.message || 'Unknown error']
      );
    } catch (logError) {
      console.error('Failed to log scan error:', logError);
    }
  }

  /**
   * Log email scan error
   */
  private async logEmailScanError(emailId: number, error: any): Promise<void> {
    try {
      await query(
        `INSERT INTO email_scans (business_id, email_id, scan_type, status, error_message, created_at)
         VALUES (NULL, $1, 'email_scan', 'failed', $2, CURRENT_TIMESTAMP)`,
        [emailId, error.message || 'Unknown error']
      );
    } catch (logError) {
      console.error('Failed to log email scan error:', logError);
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
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Get monitoring status
   */
  getMonitoringStatus(): { isMonitoring: boolean; interval: number } {
    return {
      isMonitoring: this.isMonitoring,
      interval: this.SCAN_INTERVAL
    };
  }

  /**
   * Manually trigger email scan for a specific business
   */
  async triggerBusinessScan(businessId: number): Promise<void> {
    try {
      const businessEmails = await query(
        `SELECT id, business_id, email_address, is_connected, last_checked
         FROM monitored_emails 
         WHERE business_id = $1 AND is_connected = true`,
        [businessId]
      );

      if (businessEmails.rows.length === 0) {
        console.log(`No connected emails found for business ${businessId}`);
        return;
      }

      console.log(`Manually scanning ${businessEmails.rows.length} emails for business ${businessId}`);

      for (const emailRow of businessEmails.rows) {
        const email: MonitoredEmail = {
          id: emailRow.id,
          businessId: emailRow.business_id,
          emailAddress: emailRow.email_address,
          isConnected: emailRow.is_connected,
          lastChecked: emailRow.last_checked
        };

        await this.scanEmailAddress(email);
      }

    } catch (error) {
      console.error(`Error during manual scan for business ${businessId}:`, error);
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
          COUNT(CASE WHEN is_connected = true THEN 1 END) as connected_emails,
          COUNT(CASE WHEN is_connected = false THEN 1 END) as disconnected_emails,
          COUNT(CASE WHEN last_checked > NOW() - INTERVAL '1 hour' THEN 1 END) as recently_checked
         FROM monitored_emails`,
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
      const emailStats = stats.rows[0] || {
        total_emails: 0,
        connected_emails: 0,
        disconnected_emails: 0,
        recently_checked: 0
      };

      const scanStatsData = scanStats.rows[0] || {
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
      console.error('Failed to get monitoring stats:', error);
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
