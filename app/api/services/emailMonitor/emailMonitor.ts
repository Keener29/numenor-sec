import { query } from '../../../db/connection.js';
import { monitoringLogger } from '../../../utils/logger.js';
import { processedEmailsService } from './processedEmailsService.js';
import { emailSyncService } from './emailSyncService.js';
import { monitoringStatsService } from './monitoringStatsService.js';

/**
 * Main EmailMonitor orchestrator class
 * Coordinates all email monitoring services
 */
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
      await processedEmailsService.purgeProcessedEmails(); // run once at startup
    } catch (e) {
      monitoringLogger.error('Initial purge of processed_emails failed', { operation: 'purge-initial' }, e as Error);
    }
    this.purgeInterval = setInterval(async () => {
      try {
        await processedEmailsService.purgeProcessedEmails();
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
    startHistoryId: string
  ): Promise<string> {
    return emailSyncService.processNewEmailsFromHistory(
      businessId,
      emailId,
      emailAddress,
      startHistoryId
    );
  }

  /**
   * Perform full sync fallback when historyId is too old
   */
  async performFullSyncFallback(
    businessId: number,
    emailId: number,
    emailAddress: string
  ): Promise<void> {
    return emailSyncService.performFullSyncFallback(businessId, emailId, emailAddress);
  }

  /**
   * Get monitoring status (event-driven, no polling)
   */
  getMonitoringStatus(): { isMonitoring: boolean; mode: string } {
    return monitoringStatsService.getMonitoringStatus();
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
        await emailSyncService.performFullSyncFallback(row.business_id, row.id, row.email_address);
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
   * Get monitoring statistics for a specific business
   */
  async getMonitoringStats(businessId: number): Promise<any> {
    return monitoringStatsService.getMonitoringStats(businessId);
  }
}

export const emailMonitor = new EmailMonitor();
