import { query } from '../../../db/connection.js';
import { monitoringLogger } from '../../../utils/logger.js';

/**
 * Service for managing processed emails deduplication
 */
export class ProcessedEmailsService {
  /**
   * Atomically try to mark a message as processing
   * Returns true if we successfully acquired the lock (message not already processed)
   * Returns false if message was already processed or being processed
   * This prevents race conditions where multiple requests try to process the same message
   */
  async tryMarkAsProcessing(
    businessId: number,
    emailAddress: string,
    subscription_id: string,
    messageId: string
  ): Promise<boolean> {
    const result = await query(
      `INSERT INTO processed_emails (business_id, email_address, subscription_id, message_id, processed_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (business_id, email_address, subscription_id, message_id) DO NOTHING
       RETURNING 1`,
      [businessId, emailAddress, subscription_id, messageId]
    );
    return result.rows.length > 0; // true if we got the lock
  }

  /**
   * Check if a message has already been processed
   */
  async isMessageProcessed(businessId: number, emailAddress: string, subscriptionId: string, messageId: string): Promise<boolean> {
    const res = await query(
      'SELECT 1 FROM processed_emails WHERE business_id = $1 AND email_address = $2 AND subscription_id = $3 AND message_id = $4',
      [businessId, emailAddress, subscriptionId, messageId]
    );
    return res.rows.length > 0;
  }

  /**
   * Mark a message as processed
   * Note: For new code, use tryMarkAsProcessing() for atomic check-and-reserve
   
  async markMessageProcessed(businessId: number, emailAddress: string, messageId: string): Promise<void> {
    await query(
      `INSERT INTO processed_emails (business_id, email_address, message_id, processed_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (business_id, email_address, message_id) DO NOTHING`,
      [businessId, emailAddress, messageId]
    );
  }
    */

  /**
   * Unmark a message as processed (for retry after failure)
   * Removes the processing marker so the message can be retried
   */
  async unmarkMessageProcessed(
    businessId: number,
    emailAddress: string,
    subscriptionId: string,
    messageId: string
  ): Promise<void> {
    await query(
      `DELETE FROM processed_emails 
       WHERE business_id = $1 AND email_address = $2 AND subscription_id = $3 AND message_id = $4`,
      [businessId, emailAddress, subscriptionId, messageId]
    );
  }

  /**
   * Get processed emails retention hours from environment
   */
  getProcessedRetentionHours(): number {
    const raw = process.env.PROCESSED_EMAIL_RETENTION_HOURS;
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (Number.isFinite(parsed) && parsed >= 24 && parsed <= 48) {
      return parsed;
    }
    return 48; // default to 2 days
  }

  /**
   * Purge old processed emails based on retention policy
   */
  async purgeProcessedEmails(): Promise<void> {
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
}

export const processedEmailsService = new ProcessedEmailsService();
