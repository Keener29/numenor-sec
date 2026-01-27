import { query } from '../../../db/connection.js';
import { gmailOAuthService } from '../oauth/gmail/GmailOAuthService.js';
import { monitoringLogger } from '../../../utils/logger.js';
import { processedEmailsService } from './processedEmailsService.js';
import { emailProcessor } from './emailProcessor.js';
import type { MonitoredEmail } from './types.js';

/**
 * Service for syncing emails from Gmail history
 */
export class EmailSyncService {
  /**
   * Process new emails from Gmail history (called by Pub/Sub webhook)
   * Returns the latest historyId from the processed history entries
   */
  async processNewEmailsFromHistory(
    businessId: number,
    emailId: number,
    emailAddress: string,
    startHistoryId: string
  ): Promise<string> {
    try {
      monitoringLogger.info('Processing new emails from history', {
        operation: 'process-new-emails-history',
        emailAddress,
        metadata: {
          startHistoryId
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
        // Return the latestHistoryId even if no messages, so we don't reprocess
        return latestHistoryId;
      }

      monitoringLogger.info('Found new messages in history', {
        operation: 'process-new-emails-history',
        emailAddress,
        metadata: {
          messageCount: messageIds.length,
          latestHistoryId
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
        // Atomic check-and-reserve: only one process can claim this message
        const acquired = await processedEmailsService.tryMarkAsProcessing(
          businessId,
          emailAddress,
          "",
          emailMessage.id
        );
        if (!acquired) {
          monitoringLogger.debug('Message already processed or being processed, skipping', {
            operation: 'process-new-emails-history',
            emailAddress,
            metadata: { messageId: emailMessage.id }
          });
          continue;
        }

        try {
          await emailProcessor.processEmailMessage(monitoredEmail, emailMessage);
          emailsProcessed++;
          // Success - message is already marked as processed by tryMarkAsProcessing
        } catch (emailError) {
          // On failure, unmark the message so it can be retried
          await processedEmailsService.unmarkMessageProcessed(businessId, emailAddress, "", emailMessage.id);
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
          scanDuration,
          latestHistoryId
        }
      });
      
      // Return the latestHistoryId from the API response (what we actually processed)
      // This is more accurate than the notification's historyId
      return latestHistoryId;
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
      
      // Convert to Date object if it's a string
      const connectionDate = connectionTimestamp instanceof Date 
        ? connectionTimestamp 
        : new Date(connectionTimestamp);
      
      // Add a small buffer (1 second) to ensure we don't miss emails due to timing precision
      const connectionTimestampWithBuffer = new Date(connectionDate.getTime() - 1000);

      monitoringLogger.debug('Full sync using connection timestamp', {
        operation: 'full-sync-fallback',
        emailAddress,
        metadata: {
          connectionTimestamp: connectionDate.toISOString(),
          connectionTimestampWithBuffer: connectionTimestampWithBuffer.toISOString()
        }
      });

      // Fetch emails since connection
      const messages = await gmailOAuthService.fetchEmails(
        businessId,
        emailAddress,
        50,
        '',
        connectionTimestampWithBuffer
      );

      // Filter out sent/draft/trash emails and emails before connection
      // Note: Gmail's 'after:' query is date-based, so we need to filter by exact timestamp
      const filteredMessages = messages.filter(emailMessage => {
        const labels = emailMessage.labels || [];
        if (labels.includes('SENT') || labels.includes('DRAFT') || labels.includes('TRASH')) return false;
        if (emailMessage.sender === emailAddress) return false;
        
        // Ensure timestamp is after connection (with buffer)
        const messageTimestamp = emailMessage.timestamp instanceof Date 
          ? emailMessage.timestamp 
          : new Date(emailMessage.timestamp);
        return messageTimestamp >= connectionTimestampWithBuffer;
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
        // Atomic check-and-reserve: only one process can claim this message
        const acquired = await processedEmailsService.tryMarkAsProcessing(
          businessId,
          emailAddress,
          "",
          emailMessage.id
        );
        if (!acquired) {
          continue; // Already processed or being processed
        }

        try {
          await emailProcessor.processEmailMessage(monitoredEmail, emailMessage);
          emailsProcessed++;
          // Success - message is already marked as processed by tryMarkAsProcessing
        } catch (emailError) {
          // On failure, unmark the message so it can be retried
          await processedEmailsService.unmarkMessageProcessed(businessId, emailAddress, "", emailMessage.id);
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
