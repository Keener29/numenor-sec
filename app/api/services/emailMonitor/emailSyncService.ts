import { query } from '../../../db/connection.js';
import { gmailOAuthService } from '../oauth/gmail/GmailOAuthService.js';
import { monitoringLogger } from '../../../utils/logger.js';
import { processedEmailsService } from './processedEmailsService.js';
import { emailProcessor } from './emailProcessor.js';
import type { MonitoredEmail, EmailMessage } from './types.js';

/**
 * Service for syncing emails from Gmail history
 */
export class EmailSyncService {
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
      // Process each email individually - if one fails, continue with others
      // This ensures we acknowledge the notification even if some emails fail to process
      for (const emailMessage of messages) {
        const seen = await processedEmailsService.isMessageProcessed(businessId, emailAddress, emailMessage.id);
        if (seen) {
          monitoringLogger.debug('Message already processed, skipping', {
            operation: 'process-new-emails-history',
            emailAddress,
            metadata: { messageId: emailMessage.id }
          });
          continue;
        }

        // Mark as processed IMMEDIATELY to prevent duplicate processing
        // This prevents race conditions if multiple notifications arrive for the same email
        await processedEmailsService.markMessageProcessed(businessId, emailAddress, emailMessage.id);

        try {
          await emailProcessor.processEmailMessage(monitoredEmail, emailMessage);
          emailsProcessed++;
        } catch (emailError) {
          // Log error but continue processing other emails
          // Email is already marked as processed, so it won't be reprocessed
          // This ensures we acknowledge the notification even if individual emails fail
          monitoringLogger.error('Error processing individual email message', {
            operation: 'process-new-emails-history',
            emailAddress,
            metadata: {
              messageId: emailMessage.id,
              subject: emailMessage.subject
            }
          }, emailError instanceof Error ? emailError : new Error(String(emailError)));
          // Continue processing other emails - don't throw
        }
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
      // Process each email individually - if one fails, continue with others
      // This ensures we acknowledge the notification even if some emails fail to process
      for (const emailMessage of filteredMessages) {
        const seen = await processedEmailsService.isMessageProcessed(businessId, emailAddress, emailMessage.id);
        if (seen) continue;

        // Mark as processed IMMEDIATELY to prevent duplicate processing
        // This prevents race conditions if multiple notifications arrive for the same email
        await processedEmailsService.markMessageProcessed(businessId, emailAddress, emailMessage.id);

        try {
          await emailProcessor.processEmailMessage(monitoredEmail, emailMessage);
          emailsProcessed++;
        } catch (emailError) {
          // Log error but continue processing other emails
          // Email is already marked as processed, so it won't be reprocessed
          // This ensures we acknowledge the notification even if individual emails fail
          monitoringLogger.error('Error processing individual email message', {
            operation: 'full-sync-fallback',
            emailAddress,
            metadata: {
              messageId: emailMessage.id,
              subject: emailMessage.subject
            }
          }, emailError instanceof Error ? emailError : new Error(String(emailError)));
          // Continue processing other emails - don't throw
        }
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
}

export const emailSyncService = new EmailSyncService();
