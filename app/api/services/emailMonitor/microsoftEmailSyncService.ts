/**
 * Microsoft Email Sync Service
 * Handles email synchronization from Microsoft Graph change notifications
 */

import { query } from '../../../db/connection.js';
import { outlookOAuthService } from '../oauth/outlook/OutlookOAuthService.js';
import { monitoringLogger } from '../../../utils/logger.js';
import { processedEmailsService } from './processedEmailsService.js';
import { emailProcessor } from './emailProcessor.js';
import { MicrosoftGraphClient } from '../oauth/outlook/MicrosoftGraphClient.js';
import { parseGraphMessage } from '../oauth/outlook/MicrosoftEmailAdapter.js';
import type { MonitoredEmail } from './types.js';
import type { GraphMessage } from '../oauth/outlook/types.js';
import { isRetryableGraphError } from '../../utils/microsoftGraphErrorUtils.js';

/**
 * Service for syncing emails from Microsoft Graph notifications
 */
export class MicrosoftEmailSyncService {

  /**
   * Process a single message notification from Microsoft Graph
   */
  async processMessageNotification(
    businessId: number,
    emailId: number,
    emailAddress: string,
    subscriptionId: string,
    messageId: string
  ): Promise<void> {
    try {
      monitoringLogger.info('Processing Microsoft Graph message notification', {
        operation: 'process-message-notification',
        emailAddress,
        metadata: { messageId }
      });

      // Atomic check-and-reserve: only one process can claim this message
      const acquired = await processedEmailsService.tryMarkAsProcessing(
        businessId,
        emailAddress,
        subscriptionId,
        messageId
      );
      if (!acquired) {
        monitoringLogger.debug('Message already processed or being processed, skipping', {
          operation: 'process-message-notification',
          emailAddress,
          metadata: { messageId }
        });
        return;
      }

      try {
        // Get OAuth tokens
        const tokens = await outlookOAuthService.refreshTokenIfNeeded(businessId, emailAddress);
        const graphClient = new MicrosoftGraphClient(tokens.accessToken);

        // Fetch full message details
        const graphMessage = await graphClient.getMessage(messageId, {
          operation: 'get-message',
          businessId,
          emailAddress,
          metadata: { messageId }
        });

        // Normalize to EmailMessage format
        const emailMessage = parseGraphMessage(graphMessage, emailAddress);

        // Create MonitoredEmail object
        const monitoredEmail: MonitoredEmail = {
          id: emailId,
          businessId,
          emailAddress,
          isConnected: true,
          lastChecked: null
        };

        // Process email through detection pipeline
        await emailProcessor.processEmailMessage(monitoredEmail, emailMessage);
        
        // Success - message is already marked as processed by tryMarkAsProcessing
        monitoringLogger.info(`Successfully processed Microsoft Graph message, ${emailAddress}, ${emailMessage.subject}`, {
          operation: 'process-message-notification',
          emailAddress,
          metadata: { messageId, subject: emailMessage.subject }
        });
      } catch (error) {
        // On failure, unmark the message so it can be retried via fallback polling
        await processedEmailsService.unmarkMessageProcessed(businessId, emailAddress, subscriptionId, messageId);
        throw error;
      }
    } catch (error) {
      monitoringLogger.error('Error processing Microsoft Graph message notification', {
        operation: 'process-message-notification',
        emailAddress,
        metadata: { messageId }
      }, error as Error);
      throw error;
    }
  }

  /**
   * Perform fallback polling when subscription expires or notifications are missed
   */
  async performFallbackPolling(
    businessId: number,
    emailId: number,
    emailAddress: string,
    subscriptionId: string,
    lastChecked?: Date
  ): Promise<void> {
    try {
      monitoringLogger.info('Performing fallback polling for Microsoft emails', {
        operation: 'fallback-polling',
        emailAddress,
        metadata: { lastChecked: lastChecked?.toISOString() }
      });

      // Get OAuth tokens
      const tokens = await outlookOAuthService.refreshTokenIfNeeded(businessId, emailAddress);
      const graphClient = new MicrosoftGraphClient(tokens.accessToken);

      // Build filter for messages since last check
      let filter = '';
      if (lastChecked) {
        filter = `receivedDateTime ge ${lastChecked.toISOString()}`;
      }

      // Fetch all messages with pagination (to catch all missed emails)
      // Uses listAllMessages to automatically follow pagination links
      const messages = await graphClient.listAllMessages(filter, 50, {
        operation: 'fallback-polling',
        businessId,
        emailAddress
      });

      if (messages.length === 0) {
        monitoringLogger.debug('No new messages in fallback polling', {
          operation: 'fallback-polling',
          emailAddress
        });
        return;
      }

      monitoringLogger.info('Found messages in fallback polling', {
        operation: 'fallback-polling',
        emailAddress,
        metadata: { messageCount: messages.length }
      });

      // Create MonitoredEmail object
      const monitoredEmail: MonitoredEmail = {
        id: emailId,
        businessId,
        emailAddress,
        isConnected: true,
        lastChecked: null
      };

      // Process messages in parallel batches for better throughput
      const BATCH_SIZE = 5; // Process 5 messages concurrently
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const batch = messages.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(graphMessage =>
            this.processFallbackPollingMessageWithRetry(
              businessId,
              emailAddress,
              subscriptionId,
              graphMessage,
              monitoredEmail,
              graphClient
            )
          )
        );
        
        // Log any failures
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            monitoringLogger.error('Error processing message in fallback polling batch', {
              operation: 'fallback-polling',
              emailAddress,
              metadata: { messageId: batch[index].id }
            }, result.reason as Error);
          }
        });
      }

      // Update last checked timestamp
      await query(
        `UPDATE monitored_emails SET last_checked = CURRENT_TIMESTAMP WHERE id = $1`,
        [emailId]
      );

      monitoringLogger.info('Fallback polling completed', {
        operation: 'fallback-polling',
        emailAddress,
        metadata: { messagesProcessed: messages.length }
      });
    } catch (error) {
      monitoringLogger.error('Error in fallback polling', {
        operation: 'fallback-polling',
        emailAddress
      }, error as Error);
      throw error;
    }
  }
   /**
     * Process a message with retry logic and exponential backoff
     */
   private async processFallbackPollingMessageWithRetry(
    businessId: number,
    emailAddress: string,
    subscriptionId: string,
    graphMessage: GraphMessage,
    monitoredEmail: MonitoredEmail,
    graphClient: MicrosoftGraphClient,
    maxRetries: number = 3
    ): Promise<void> {
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
            await this.processFallbackPollingMessage(
                businessId,
                emailAddress,
                subscriptionId,
                graphMessage,
                monitoredEmail,
                graphClient
            );
            return; // Success
            } catch (error) {
            lastError = error as Error;
            
            // Only retry if error is retryable and we have retries left
            if (isRetryableGraphError(error) && attempt < maxRetries - 1) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
                monitoringLogger.debug('Retrying message processing after delay', {
                operation: 'process-fallback-polling-message-retry',
                emailAddress,
                metadata: {
                    messageId: graphMessage.id,
                    attempt: attempt + 1,
                    maxRetries,
                    delayMs: delay
                }
                });
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            // Non-retryable error or out of retries
            throw error;
            }
        }
        
        // Should not reach here, but TypeScript needs it
        if (lastError) throw lastError;
    }
    /**
     * Process a single message during fallback polling with retry logic
     * Uses atomic idempotency check and marks as processed only after success
     */
    private async processFallbackPollingMessage(
        businessId: number,
        emailAddress: string,
        subscriptionId: string,
        graphMessage: GraphMessage,
        monitoredEmail: MonitoredEmail,
        graphClient: MicrosoftGraphClient
        ): Promise<void> {
        // Atomic check-and-reserve: only one process can claim this message
        const acquired = await processedEmailsService.tryMarkAsProcessing(
            businessId,
            emailAddress,
            subscriptionId,
            graphMessage.id
        );
        if (!acquired) {
            // Already being processed or already processed
            return;
        }

        try {
            // Fetch full message details
            const fullMessage = await graphClient.getMessage(graphMessage.id, {
            operation: 'fallback-polling-get-message',
            businessId,
            emailAddress,
            metadata: { messageId: graphMessage.id }
            });

            // Normalize and process
            const emailMessage = parseGraphMessage(fullMessage, emailAddress);
            await emailProcessor.processEmailMessage(monitoredEmail, emailMessage);
            
            // Success - message is already marked as processed by tryMarkAsProcessing
            // (The atomic insert serves as both lock and completion marker)
        } catch (error) {
            // On failure, unmark the message so it can be retried
            await processedEmailsService.unmarkMessageProcessed(
            businessId,
            emailAddress,
            subscriptionId,
            graphMessage.id
            );
            monitoringLogger.warn('Failed to process message, unmarked for retry', {
            operation: 'process-fallback-polling-message',
            emailAddress,
            metadata: { messageId: graphMessage.id }
            });
            throw error;
        }
    }
}

export const microsoftEmailSyncService = new MicrosoftEmailSyncService();

