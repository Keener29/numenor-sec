/**
 * Gmail Watch Renewal Scheduler
 * Renews Gmail watch subscriptions every 24 hours (Gmail requirement)
 */

import { query } from '../../db/connection.js';
import { gmailOAuthService } from './oauth/gmail/GmailOAuthService.js';
import { monitoringLogger } from '../../utils/logger.js';
import * as Watch from './oauth/gmail/GmailOAuthService/watch.js';

class WatchRenewalScheduler {
  private renewalInterval: NodeJS.Timeout | null = null;
  private readonly RENEWAL_CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour
  private readonly RENEWAL_THRESHOLD_HOURS = 24; // Renew watches expiring within 24 hours

  /**
   * Start the watch renewal scheduler
   */
  async start(): Promise<void> {
    monitoringLogger.info('Starting Gmail watch renewal scheduler', {
      operation: 'watch-renewal-start'
    });

    // Run initial renewal check
    await this.renewExpiringWatches();

    // Schedule periodic renewal checks
    this.renewalInterval = setInterval(async () => {
      try {
        await this.renewExpiringWatches();
      } catch (error) {
        monitoringLogger.error('Error during watch renewal check', {
          operation: 'watch-renewal-interval'
        }, error as Error);
      }
    }, this.RENEWAL_CHECK_INTERVAL_MS);

    monitoringLogger.info('Gmail watch renewal scheduler started', {
      operation: 'watch-renewal-start'
    });
  }

  /**
   * Stop the watch renewal scheduler
   */
  stop(): void {
    if (this.renewalInterval) {
      clearInterval(this.renewalInterval);
      this.renewalInterval = null;
    }
    monitoringLogger.info('Gmail watch renewal scheduler stopped', {
      operation: 'watch-renewal-stop'
    });
  }

  /**
   * Renew watches that are expiring soon
   */
  private async renewExpiringWatches(): Promise<void> {
    try {
      const watchesNeedingRenewal = await Watch.getWatchesNeedingRenewal();

      if (watchesNeedingRenewal.length === 0) {
        monitoringLogger.debug('No watches need renewal', {
          operation: 'renew-expiring-watches'
        });
        return;
      }

      monitoringLogger.info('Renewing expiring Gmail watches', {
        operation: 'renew-expiring-watches',
        metadata: {
          count: watchesNeedingRenewal.length
        }
      });

      // Renew each watch
      for (const watch of watchesNeedingRenewal) {
        try {
          await this.renewWatch(watch.businessId, watch.emailAddress);
        } catch (error) {
          monitoringLogger.error('Failed to renew watch', {
            operation: 'renew-expiring-watches',
            metadata: {
              businessId: watch.businessId,
              emailAddress: watch.emailAddress
            }
          }, error as Error);
          // Continue with other watches even if one fails
        }
      }

      monitoringLogger.info('Completed watch renewal cycle', {
        operation: 'renew-expiring-watches',
        metadata: {
          renewed: watchesNeedingRenewal.length
        }
      });
    } catch (error) {
      monitoringLogger.error('Error renewing expiring watches', {
        operation: 'renew-expiring-watches'
      }, error as Error);
    }
  }

  /**
   * Renew a specific watch
   */
  async renewWatch(businessId: number, emailAddress: string): Promise<void> {
    try {
      monitoringLogger.info('Renewing Gmail watch', {
        operation: 'renew-watch',
        metadata: {
          businessId,
          emailAddress
        }
      });

      // Call Gmail watch API to renew subscription
      const watchResult = await gmailOAuthService.watchMailbox(businessId, emailAddress);

      monitoringLogger.info('Gmail watch renewed successfully', {
        operation: 'renew-watch',
        metadata: {
          businessId,
          emailAddress,
          historyId: watchResult.historyId,
          expiration: watchResult.expiration.toISOString()
        }
      });
    } catch (error) {
      monitoringLogger.error('Failed to renew Gmail watch', {
        operation: 'renew-watch',
        metadata: {
          businessId,
          emailAddress
        }
      }, error as Error);
      throw error;
    }
  }

  /**
   * Renew all watches for a business (useful for manual triggers)
   */
  async renewBusinessWatches(businessId: number): Promise<void> {
    try {
      const result = await query(
        `SELECT email_address FROM gmail_watches WHERE business_id = $1`,
        [businessId]
      );

      if (result.rows.length === 0) {
        monitoringLogger.info('No watches found for business', {
          operation: 'renew-business-watches',
          metadata: { businessId }
        });
        return;
      }

      monitoringLogger.info('Renewing all watches for business', {
        operation: 'renew-business-watches',
        metadata: {
          businessId,
          watchCount: result.rows.length
        }
      });

      for (const row of result.rows) {
        const emailAddress = (row as { email_address: string }).email_address;
        try {
          await this.renewWatch(businessId, emailAddress);
        } catch (error) {
          monitoringLogger.error('Failed to renew watch for email', {
            operation: 'renew-business-watches',
            metadata: {
              businessId,
              emailAddress
            }
          }, error as Error);
          // Continue with other emails
        }
      }
    } catch (error) {
      monitoringLogger.error('Error renewing business watches', {
        operation: 'renew-business-watches',
        metadata: { businessId }
      }, error as Error);
      throw error;
    }
  }
}

export const watchRenewalScheduler = new WatchRenewalScheduler();

