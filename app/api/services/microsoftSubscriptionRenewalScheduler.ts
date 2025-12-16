/**
 * Microsoft Subscription Renewal Scheduler
 * Renews Microsoft Graph subscriptions before they expire (max 3 days)
 */

import { outlookOAuthService } from './oauth/outlook/OutlookOAuthService.js';
import { microsoftSubscriptionService, type MicrosoftSubscription } from './oauth/outlook/MicrosoftSubscriptionService.js';
import { monitoringLogger } from '../../utils/logger.js';

class MicrosoftSubscriptionRenewalScheduler {
  private renewalInterval: NodeJS.Timeout | null = null;
  private readonly RENEWAL_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // Check every 6 hours
  private readonly RENEWAL_THRESHOLD_HOURS = 24; // Renew subscriptions expiring within 24 hours
  private isRunning = false;


  /**
   * Start the subscription renewal scheduler
   */
  async start(): Promise<void> {
    monitoringLogger.info('Starting Microsoft subscription renewal scheduler', {
      operation: 'microsoft-subscription-renewal-start'
    });

    // Run initial renewal check
    await this.renewExpiringSubscriptions();

    // Schedule periodic renewal checks
    this.renewalInterval = setInterval(async () => {
      try {
        await this.renewExpiringSubscriptions();
      } catch (error) {
        monitoringLogger.error('Error during Microsoft subscription renewal check', {
          operation: 'microsoft-subscription-renewal-interval'
        }, error as Error);
      }
    }, this.RENEWAL_CHECK_INTERVAL_MS);

    monitoringLogger.info('Microsoft subscription renewal scheduler started', {
      operation: 'microsoft-subscription-renewal-start'
    });
  }

  /**
   * Stop the subscription renewal scheduler
   */
  stop(): void {
    if (this.renewalInterval) {
      clearInterval(this.renewalInterval);
      this.renewalInterval = null;
      monitoringLogger.info('Microsoft subscription renewal scheduler stopped', {
        operation: 'microsoft-subscription-renewal-stop'
      });
    }
  }

  /**
   * Renew a specific Microsoft Graph subscription
   */
  private async renewSubscription(subscription: MicrosoftSubscription): Promise<void> {
    // Refresh OAuth token if needed
    const tokens = await outlookOAuthService.refreshTokenIfNeeded(
      subscription.businessId,
      subscription.emailAddress
    );

    // Renew subscription via Graph API
    await microsoftSubscriptionService.renewSubscription(
      subscription.businessId,
      subscription.emailAddress,
      tokens.accessToken,
      {
        operation: 'renew-subscription',
        businessId: subscription.businessId,
        emailAddress: subscription.emailAddress,
        metadata: {
          subscriptionId: subscription.subscriptionId,
          expirationDate: subscription.expirationDate.toISOString()
        }
      }
    );

    monitoringLogger.info('Microsoft subscription renewed successfully', {
      operation: 'renew-subscription',
      businessId: subscription.businessId,
      emailAddress: subscription.emailAddress,
      metadata: {
        subscriptionId: subscription.subscriptionId
      }
    });
  }

  /**
   * Renew subscriptions that are expiring soon
   */
  private async renewExpiringSubscriptions(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      monitoringLogger.debug('Checking for expiring Microsoft subscriptions', {
        operation: 'renew-expiring-subscriptions'
      });

      const subscriptions = await microsoftSubscriptionService.getSubscriptionsNeedingRenewal();

      if (subscriptions.length === 0) {
        monitoringLogger.debug('No Microsoft subscriptions need renewal', {
          operation: 'renew-expiring-subscriptions'
        });
        return;
      }

      monitoringLogger.info(`Found ${subscriptions.length} Microsoft subscriptions needing renewal`, {
        operation: 'renew-expiring-subscriptions',
        metadata: { count: subscriptions.length }
      });

      // Renew each subscription
      for (const subscription of subscriptions) {
        try {
          await this.renewSubscription(subscription);
        } catch (error) {
          monitoringLogger.error('Failed to renew Microsoft subscription', {
            operation: 'renew-expiring-subscriptions',
            metadata: {
              businessId: subscription.businessId,
              emailAddress: subscription.emailAddress,
              subscriptionId: subscription.subscriptionId
            }
          }, error as Error);
          // Continue with other subscriptions even if one fails
        }
      }
    } catch (error) {
      monitoringLogger.error('Error in Microsoft subscription renewal check', {
        operation: 'renew-expiring-subscriptions'
      }, error as Error);
    }
    finally {
      this.isRunning = false;
    }
  }
}

export const microsoftSubscriptionRenewalScheduler = new MicrosoftSubscriptionRenewalScheduler();

