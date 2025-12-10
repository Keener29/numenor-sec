/**
 * Gmail Watch API
 * Handles Gmail mailbox watch subscriptions for Pub/Sub push notifications
 */

import { query } from '../../../../../db/connection.js';
import { oauthLogger } from '../../../../../utils/logger.js';
import { ErrorFactory, ErrorCodes } from '../../../errorHandler.js';
import { pubsubService } from '../../../pubsub/pubsubService.js';
import type { LogContext } from '../../base/types.js';

export type SetCredentialsFn = (businessId: number, emailAddress: string) => Promise<void>;

interface WatchResponse {
  historyId: string;
  expiration: string; // RFC3339 timestamp
}

/**
 * Set up a Gmail mailbox watch for push notifications
 * Gmail watch subscriptions expire after 7 days, so they need to be renewed
 */
export async function watchMailbox(
  setCredentials: SetCredentialsFn,
  gmail: any,
  businessId: number,
  emailAddress: string
): Promise<{ historyId: string; expiration: Date }> {
  const context: LogContext = {
    operation: 'watch-mailbox',
    businessId,
    emailAddress
  };

  try {
    await setCredentials(businessId, emailAddress);
    
    // Get the full topic resource name (projects/{project}/topics/{topic})
    const topicName = pubsubService.getTopicResourceName();

    // Call Gmail watch API
    // userId: 'me' - Gmail API convention meaning "the authenticated user's mailbox"
    //   This refers to the user whose OAuth token is set via setCredentials() above
    //   Equivalent to using the user's email address, but 'me' is the standard way
    // labelIds: ['INBOX'] - only watch for new messages in INBOX
    // topicName: Pub/Sub topic to send notifications to
    const response = await gmail.users.watch({
      userId: 'me', // Authenticated user's mailbox (set via OAuth token)
      requestBody: {
        labelIds: ['INBOX'],
        topicName: topicName
      }
    });

    const watchResponse = response.data as WatchResponse;
    const expiration = new Date(watchResponse.expiration);
    const historyId = watchResponse.historyId;

    // Store watch expiration and historyId in database
    await query(
      `INSERT INTO gmail_watches (business_id, email_address, watch_expiration, history_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (business_id, email_address)
       DO UPDATE SET watch_expiration = EXCLUDED.watch_expiration,
                     history_id = EXCLUDED.history_id,
                     updated_at = CURRENT_TIMESTAMP`,
      [businessId, emailAddress, expiration, historyId]
    );

    oauthLogger.info('Gmail watch subscription created successfully', {
      ...context,
      metadata: {
        historyId,
        expiration: expiration.toISOString(),
        topicName
      }
    });

    return { historyId, expiration };
  } catch (error: any) {
    oauthLogger.error('Failed to create Gmail watch subscription', context, error as Error);
    
    // Handle specific Gmail API errors
    if (error?.code === 403) {
      throw ErrorFactory.oauthService(
        ErrorCodes.OAUTH_AUTHORIZATION_FAILED,
        'Gmail watch API access denied. Ensure the OAuth scope includes gmail.readonly and Pub/Sub topic exists.'
      );
    }

    throw ErrorFactory.oauthService(
      ErrorCodes.GMAIL_API_ERROR,
      'Failed to create Gmail watch subscription'
    );
  }
}

/**
 * Stop watching a Gmail mailbox (stop sending notifications)
 */
export async function stopWatch(
  setCredentials: SetCredentialsFn,
  gmail: any,
  businessId: number,
  emailAddress: string
): Promise<void> {
  const context: LogContext = {
    operation: 'stop-watch',
    businessId,
    emailAddress
  };

  try {
    await setCredentials(businessId, emailAddress);

    // Call Gmail stop API
    await gmail.users.stop({
      userId: 'me'
    });

    // Remove watch record from database
    await query(
      'DELETE FROM gmail_watches WHERE business_id = $1 AND email_address = $2',
      [businessId, emailAddress]
    );

    oauthLogger.info('Gmail watch subscription stopped successfully', context);
  } catch (error) {
    oauthLogger.error('Failed to stop Gmail watch subscription', context, error as Error);
    // Don't throw - continue even if stop fails
  }
}

/**
 * Get watch expiration for an email address
 */
export async function getWatchExpiration(
  businessId: number,
  emailAddress: string
): Promise<Date | null> {
  const result = await query(
    'SELECT watch_expiration FROM gmail_watches WHERE business_id = $1 AND email_address = $2',
    [businessId, emailAddress]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return (result.rows[0] as { watch_expiration: Date }).watch_expiration;
}

/**
 * Get all watches that need renewal (expiring within 24 hours)
 */
export async function getWatchesNeedingRenewal(): Promise<Array<{ businessId: number; emailAddress: string }>> {
  const result = await query(
    `SELECT business_id, email_address 
     FROM gmail_watches 
     WHERE watch_expiration < NOW() + INTERVAL '24 hours'
     ORDER BY watch_expiration ASC`,
    []
  );

  return result.rows.map(row => ({
    businessId: (row as { business_id: number }).business_id,
    emailAddress: (row as { email_address: string }).email_address
  }));
}

