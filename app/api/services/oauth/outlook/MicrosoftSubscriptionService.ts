/**
 * Microsoft Graph Subscription Service
 * Manages Graph API subscriptions for change notifications
 */

import { query } from '../../../../db/connection.js';
import { oauthLogger } from '../../../../utils/logger.js';
import { ErrorFactory, ErrorCodes } from '../../errorHandler.js';
import { MicrosoftGraphClient } from './MicrosoftGraphClient.js';
import type { LogContext } from '../base/types.js';
import { signClientState } from '../base/stateSigning.js';

export interface MicrosoftSubscription {
  businessId: number;
  emailAddress: string;
  subscriptionId: string;
  resourcePath: string;
  expirationDate: Date;
  lastNotificationDate: Date | null;
}

const SUBSCRIPTION_EXPIRATION_HOURS = parseInt(
  process.env.MICROSOFT_SUBSCRIPTION_EXPIRATION_HOURS || '72',
  10
);
const RENEWAL_THRESHOLD_HOURS = parseInt(
  process.env.MICROSOFT_SUBSCRIPTION_RENEWAL_THRESHOLD_HOURS || '24',
  10
);

const DEFAULT_RESOURCE_PATH = '/me/messages';

export class MicrosoftSubscriptionService {
  /**
   * Create a new subscription for an email
   */
  async createSubscription(
    businessId: number,
    emailAddress: string,
    accessToken: string,
    notificationUrl: string,
    context: LogContext = { operation: 'create-subscription' }
  ): Promise<MicrosoftSubscription> {
    try {
      const graphClient = new MicrosoftGraphClient(accessToken);
      
      // Calculate expiration (max 3 days from now)
      const expirationDate = new Date();
      expirationDate.setHours(expirationDate.getHours() + SUBSCRIPTION_EXPIRATION_HOURS);

      // Create subscription via Graph API with HMAC-signed clientState
      // SECURITY: Use signed clientState to prevent webhook spoofing
      const signedClientState = signClientState(businessId, emailAddress);
      const subscription = await graphClient.createSubscription(
        DEFAULT_RESOURCE_PATH,
        notificationUrl,
        expirationDate.toISOString(),
        signedClientState, // HMAC-signed clientState: {businessId}:{emailAddress}:{signature}
        context
      );

      // Store in database
      await query(
        `INSERT INTO microsoft_subscriptions 
         (business_id, email_address, subscription_id, resource_path, expiration_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (business_id, email_address)
         DO UPDATE SET subscription_id = EXCLUDED.subscription_id,
                       resource_path = EXCLUDED.resource_path,
                       expiration_date = EXCLUDED.expiration_date,
                       updated_at = CURRENT_TIMESTAMP`,
        [
          businessId,
          emailAddress,
          subscription.id,
          subscription.resource,
          expirationDate,
        ]
      );

      oauthLogger.info('Microsoft subscription created', {
        ...context,
        metadata: {
          ...context?.metadata,
          subscriptionId: subscription.id,
          expirationDate: expirationDate.toISOString(),
        },
      });

      return {
        businessId,
        emailAddress,
        subscriptionId: subscription.id,
        resourcePath: subscription.resource,
        expirationDate,
        lastNotificationDate: null,
      };
    } catch (error) {
      oauthLogger.error('Failed to create Microsoft subscription', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to create Microsoft Graph subscription'
      );
    }
  }

  /**
   * Renew an existing subscription
   */
  async renewSubscription(
    businessId: number,
    emailAddress: string,
    accessToken: string,
    context: LogContext = { operation: 'renew-subscription' }
  ): Promise<MicrosoftSubscription> {
    try {
      // Get subscription from database
      const subResult = await query(
        `SELECT subscription_id, expiration_date, resource_path, last_notification_date
         FROM microsoft_subscriptions 
         WHERE business_id = $1 AND email_address = $2`,
        [businessId, emailAddress]
      );

      if (subResult.rows.length === 0) {
        throw new Error('Subscription not found');
      }

      const dbRow = subResult.rows[0] as {
        subscription_id: string;
        resource_path: string;
        last_notification_date: Date | null;
      };
      const subscriptionId = dbRow.subscription_id;
      const graphClient = new MicrosoftGraphClient(accessToken);

      // Calculate new expiration
      const expirationDate = new Date();
      expirationDate.setHours(expirationDate.getHours() + SUBSCRIPTION_EXPIRATION_HOURS);

      const resourcePath = dbRow.resource_path;
      const lastNotificationDate = dbRow.last_notification_date;

      // Renew via Graph API
      await graphClient.renewSubscription(subscriptionId, expirationDate.toISOString(), context);

      // Update database
      await query(
        `UPDATE microsoft_subscriptions 
         SET expiration_date = $1, updated_at = CURRENT_TIMESTAMP
         WHERE business_id = $2 AND email_address = $3`,
        [expirationDate, businessId, emailAddress]
      );

      oauthLogger.info('Microsoft subscription renewed', {
        ...context,
        metadata: {
          ...context?.metadata,
          subscriptionId,
          expirationDate: expirationDate.toISOString(),
        },
      });

      return {
        businessId,
        emailAddress,
        subscriptionId,
        resourcePath,
        expirationDate,
        lastNotificationDate,
      };
    } catch (error) {
        if (error instanceof Error && error.message.includes('404')) {
            throw ErrorFactory.oauthService(
                ErrorCodes.RECORD_NOT_FOUND,
                'Subscription not found'
            );
        } else {
            throw ErrorFactory.oauthService(
                ErrorCodes.INTERNAL_SERVER_ERROR,
                'Failed to renew Microsoft Graph subscription: ' + (error as Error).message
            );
        }
    }
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(
    businessId: number,
    emailAddress: string,
    accessToken: string,
    context: LogContext = { operation: 'delete-subscription' }
  ): Promise<void> {
    try {
      // Get subscription ID
      const subResult = await query(
        `SELECT subscription_id FROM microsoft_subscriptions 
         WHERE business_id = $1 AND email_address = $2`,
        [businessId, emailAddress]
      );

      if (subResult.rows.length === 0) {
        oauthLogger.warn('Subscription not found for deletion', context);
        return;
      }

      const subscriptionId = (subResult.rows[0] as { subscription_id: string }).subscription_id;
      const graphClient = new MicrosoftGraphClient(accessToken);

      // Delete via Graph API
      await graphClient.deleteSubscription(subscriptionId, context);

      // Delete from database
      await query(
        `DELETE FROM microsoft_subscriptions 
         WHERE business_id = $1 AND email_address = $2`,
        [businessId, emailAddress]
      );

      oauthLogger.info('Microsoft subscription deleted', {
        ...context,
        metadata: { subscriptionId },
      });
    } catch (error) {
      oauthLogger.error('Failed to delete Microsoft subscription', context || {}, error as Error);
      // Don't throw - subscription might already be deleted
    }
  }

  /**
   * Get subscriptions that need renewal (expiring within threshold)
   */
  async getSubscriptionsNeedingRenewal(): Promise<MicrosoftSubscription[]> {
    const thresholdDate = new Date();
    thresholdDate.setHours(thresholdDate.getHours() + RENEWAL_THRESHOLD_HOURS);

    const result = await query(
      `SELECT business_id, email_address, subscription_id, resource_path, expiration_date, last_notification_date
       FROM microsoft_subscriptions
       WHERE expiration_date < $1`,
      [thresholdDate]
    );

    return result.rows.map((row) => {
      const dbRow = row as {
        business_id: number;
        email_address: string;
        subscription_id: string;
        resource_path: string;
        expiration_date: Date;
        last_notification_date: Date | null;
      };
      return {
        businessId: dbRow.business_id,
        emailAddress: dbRow.email_address,
        subscriptionId: dbRow.subscription_id,
        resourcePath: dbRow.resource_path,
        expirationDate: dbRow.expiration_date,
        lastNotificationDate: dbRow.last_notification_date,
      };
    });
  }

  /**
   * Get subscription for an email
   */
  async getSubscription(
    businessId: number,
    emailAddress: string
  ): Promise<MicrosoftSubscription | null> {
    const result = await query(
      `SELECT subscription_id, resource_path, expiration_date, last_notification_date
       FROM microsoft_subscriptions
       WHERE business_id = $1 AND email_address = $2`,
      [businessId, emailAddress]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const dbRow = result.rows[0] as {
      subscription_id: string;
      resource_path: string;
      expiration_date: Date;
      last_notification_date: Date | null;
    };
    return {
      businessId,
      emailAddress,
      subscriptionId: dbRow.subscription_id,
      resourcePath: dbRow.resource_path,
      expirationDate: dbRow.expiration_date,
      lastNotificationDate: dbRow.last_notification_date,
    };
  }

  /**
   * Update last notification date
   */
  async updateLastNotificationDate(
    businessId: number,
    emailAddress: string
  ): Promise<void> {
    await query(
      `UPDATE microsoft_subscriptions 
       SET last_notification_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE business_id = $1 AND email_address = $2`,
      [businessId, emailAddress]
    );
  }
}

export const microsoftSubscriptionService = new MicrosoftSubscriptionService();

