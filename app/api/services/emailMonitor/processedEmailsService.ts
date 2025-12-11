import { query } from '../../../db/connection.js';
import { monitoringLogger } from '../../../utils/logger.js';

/**
 * Service for managing processed emails deduplication
 */
export class ProcessedEmailsService {
  /**
   * Check if a message has already been processed
   */
  async isMessageProcessed(businessId: number, emailAddress: string, messageId: string): Promise<boolean> {
    const res = await query(
      'SELECT 1 FROM processed_emails WHERE business_id = $1 AND email_address = $2 AND message_id = $3',
      [businessId, emailAddress, messageId]
    );
    return res.rows.length > 0;
  }

  /**
   * Mark a message as processed
   */
  async markMessageProcessed(businessId: number, emailAddress: string, messageId: string): Promise<void> {
    await query(
      `INSERT INTO processed_emails (business_id, email_address, message_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (business_id, email_address, message_id) DO NOTHING`,
      [businessId, emailAddress, messageId]
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
