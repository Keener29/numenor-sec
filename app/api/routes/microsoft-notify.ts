/**
 * Microsoft Graph Webhook Route
 * Receives change notifications from Microsoft Graph when Outlook messages arrive
 */

import { Router, type Request, type Response } from 'express';
import { query } from '../../db/connection.js';
import { microsoftEmailSyncService } from '../services/emailMonitor/microsoftEmailSyncService.js';
import { monitoringLogger } from '../../utils/logger.js';
import { microsoftSubscriptionService } from '../services/oauth/outlook/MicrosoftSubscriptionService.js';
import { verifyClientState } from '../services/oauth/outlook/clientStateUtils.js';
import { findMonitoredEmail } from '../utils/monitoredEmailUtils.js';
import { isRetryableGraphError } from '../utils/microsoftGraphErrorUtils.js';
import type { GraphNotification } from '../services/oauth/outlook/types.js';
const router = Router();

/**
 * Parse and validate Microsoft Graph notification body
 * Returns parsed notification or null if invalid
 */
function parseNotificationBody(body: unknown): GraphNotification | null {
  try {
    // Safe JSON parsing - Microsoft Graph sends valid JSON
    const notification = body as GraphNotification;

    // Validate structure
    if (!notification.value || !Array.isArray(notification.value)) {
      monitoringLogger.warn('Invalid Microsoft Graph notification format', {
        operation: 'parse-notification-body',
        metadata: { bodyType: typeof body, hasValue: !!notification.value }
      });
      return null;
    }

    return notification;
  } catch (parseError) {
    monitoringLogger.error('Failed to parse notification body', {
      operation: 'parse-notification-body',
      metadata: { error: parseError instanceof Error ? parseError.message : String(parseError) }
    }, parseError as Error);
    return null;
  }
}

/**
 * Unmark notification as processed (idempotency) if processing fails
 */
async function unmarkNotificationProcessed(
    businessId: number,
    emailAddress: string,
    subscriptionId: string,
    messageId: string,
  ): Promise<void> {
    await query(
        `DELETE FROM processed_emails
        WHERE business_id = $1 AND email_address = $2 AND subscription_id = $3 AND message_id = $4`,
        [businessId, emailAddress, subscriptionId, messageId]
    );
}

/**
 * Handle validationToken challenge (Microsoft Graph webhook verification)
 * Microsoft sends GET request with validationToken query param
 */
router.get('/', async (req: Request, res: Response) => {
  const validationToken = req.query.validationToken as string | undefined;

  if (validationToken) {
    monitoringLogger.info('Microsoft Graph webhook validation received', {
      operation: 'microsoft-notify-validation',
      metadata: { validationToken: validationToken.substring(0, 20) + '...' }
    });

    // Return validationToken as plain text (required by Microsoft Graph)
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(validationToken);
  }

  // If no validationToken, return 400
  return res.status(400).json({ error: 'Missing validationToken' });
});



/**
 * Extract message ID from Graph resource path
 */
function extractMessageIdFromResource(resource: string): string | null {
  // Resource format: /me/messages/{messageId} or /Users/{userId}/Messages/{messageId}
  const match = resource.match(/\/(?:me|Users\/[^/]+)\/messages\/([^/]+)/i);
  return match ? match[1] : null;
}

/**
 * Processed notification data extracted from Graph notification item
 */
interface ProcessedNotification {
  subscriptionId: string;
  messageId: string;
  businessId: number;
  emailAddress: string;
}

/**
 * Validate and extract data from a Graph notification item
 * Returns processed notification data or null if item should be skipped
 * 
 * Handles:
 * - Subscription expiration notifications (skipped)
 * - Non-created changeTypes (skipped)
 * - Message ID extraction
 * - ClientState verification
 * - Business/email lookup fallback
 */
async function verifyNotificationItem(
  item: GraphNotification['value'][0]
): Promise<ProcessedNotification | null> {
  // Handle subscription expiration notification
  if (item.subscriptionExpirationDateTime) {
    monitoringLogger.debug('Subscription expiration notification received', {
      operation: 'verify-notification-item',
      metadata: {
        subscriptionId: item.subscriptionId,
        expirationDateTime: item.subscriptionExpirationDateTime
      }
    });
    // Subscription renewal handled by cron job - skip silently
    return null;
  }

  // SECURITY: Only process 'created' changeType (new messages)
  // Ignore 'updated' and 'deleted' to prevent processing modified/deleted emails
  if (item.changeType !== 'created') {
    monitoringLogger.debug('Skipping non-created changeType', {
      operation: 'verify-notification-item',
      metadata: {
        subscriptionId: item.subscriptionId,
        changeType: item.changeType,
        resource: item.resource
      }
    });
    return null;
  }

  // Extract message ID from resource
  const messageId = extractMessageIdFromResource(item.resource);
  if (!messageId) {
    monitoringLogger.debug('Could not extract message ID from resource', {
      operation: 'verify-notification-item',
      metadata: { resource: item.resource }
    });
    return null;
  }

  // SECURITY: Verify signed clientState to prevent webhook spoofing
  let businessId: number | null = null;
  let emailAddress: string | null = null;

  if (item.clientState) {
    const verified = verifyClientState(item.clientState);
    if (verified) {
      businessId = verified.businessId;
      emailAddress = verified.emailAddress;
    } else {
      // Invalid signature - log and skip (prevents spoofed notifications)
      monitoringLogger.warn('Invalid clientState signature - rejecting notification', {
        operation: 'verify-notification-item',
        metadata: {
          subscriptionId: item.subscriptionId,
          messageId,
          clientStatePreview: item.clientState.substring(0, 50)
        }
      });
      return null;
    }
  }

  // Fallback: Look up subscription if clientState missing (backward compatibility)
  if (!businessId || !emailAddress) {
    const subResult = await query(
      `SELECT business_id, email_address FROM microsoft_subscriptions WHERE subscription_id = $1`,
      [item.subscriptionId]
    );
    if (subResult.rows.length > 0) {
      businessId = (subResult.rows[0] as { business_id: number, email_address: string }).business_id;
      emailAddress = (subResult.rows[0] as { business_id: number, email_address: string }).email_address;
    }
  }

  if (!businessId || !emailAddress) {
    monitoringLogger.debug('Could not determine business/email for notification', {
      operation: 'verify-notification-item',
      metadata: {
        subscriptionId: item.subscriptionId,
        resource: item.resource,
        hasClientState: !!item.clientState
      }
    });
    return null;
  }

  return {
    subscriptionId: item.subscriptionId,
    messageId,
    businessId,
    emailAddress
  };
}


/**
 * Check if notification was already processed (idempotency)
 * Uses processed_emails table to prevent duplicate processing across server restarts
 * Uses messageId directly (Microsoft Graph message IDs are globally unique)
 */
async function isNotificationProcessed(
  businessId: number,
  emailAddress: string,
  subscriptionId: string,
  messageId: string
): Promise<boolean> {
  try {
    const result = await query(
      `SELECT 1 FROM processed_emails 
       WHERE business_id = $1 AND email_address = $2 AND subscription_id = $3 AND message_id = $4 
       LIMIT 1`,
      [businessId, emailAddress, subscriptionId, messageId]
    );
    return result.rows.length > 0;
  } catch (error) {
    monitoringLogger.error('Error checking notification idempotency', {
      operation: 'check-notification-idempotency',
      metadata: { businessId, emailAddress, subscriptionId, messageId }
    }, error as Error);
    // On error, assume not processed to avoid missing notifications
    return false;
  }
}

/**
 * Mark notification as processed (idempotency)
 * Uses ON CONFLICT DO NOTHING to handle race conditions gracefully
 */
async function markNotificationProcessed(
  businessId: number,
  emailAddress: string,
  subscriptionId: string,
  messageId: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO processed_emails (business_id, email_address, subscription_id, message_id, processed_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (business_id, email_address, subscription_id, message_id) DO NOTHING`,
      [businessId, emailAddress, subscriptionId, messageId]
    );
  } catch (error) {
    monitoringLogger.error('Error marking notification as processed', {
      operation: 'mark-notification-processed',
      metadata: { businessId, emailAddress, subscriptionId, messageId }
    }, error as Error);
  }
}

/**
 * @route POST /api/microsoft-notify
 * @desc Receive Microsoft Graph change notifications
 * @access Public (authenticated via validationToken and subscription clientState)
 * 
 * Security hardening:
 * - Validates HMAC-SHA256 signed clientState to prevent spoofing
 * - Processes only 'created' changeType (ignores updates/deletes)
 * - Idempotency check prevents duplicate processing
 * - Always returns 202 to prevent Microsoft retries
 */
router.post('/', async (req: Request, res: Response) => {
  // Always return 202 Accepted - Microsoft Graph requirement
  // Process asynchronously to prevent retries on errors
  res.status(202).json({ status: 'accepted' });

  try {
    // Parse and validate notification body
    const notification = parseNotificationBody(req.body);
    if (!notification) {
      return; // Already logged, exit silently (already sent 202)
    }

    monitoringLogger.info('Received Microsoft Graph notification', {
      operation: 'microsoft-notify',
      metadata: { notificationCount: notification.value.length }
    });

    // Process each notification asynchronously
    for (const item of notification.value) {
      await processNotificationItemInternal(item);
    }
  } catch (error) {
    // Log error but don't throw - already sent 202 response
    // This prevents Microsoft Graph from retrying on transient errors
    monitoringLogger.error('Error processing Microsoft Graph notification', {
      operation: 'microsoft-notify'
    }, error as Error);
  }
});

async function processNotificationItemInternal(item: GraphNotification['value'][0]): Promise<void> {
  try {
    // Validate and extract notification data (handles all filtering/validation)
    const processed = await verifyNotificationItem(item);
    if (!processed) {
      return; // Item was skipped (expiration, wrong changeType, invalid, etc.)
    }

    const { subscriptionId, messageId, businessId, emailAddress } = processed;

    // Find monitored email record (filter by 'outlook' provider)
    const emailRecord = await findMonitoredEmail(emailAddress, 'outlook');
    if (!emailRecord) {
      monitoringLogger.debug('Monitored email not found for notification', {
        operation: 'microsoft-notify',
        metadata: { emailAddress, businessId }
      });
      return;
    }

    // IDEMPOTENCY: Check if notification already processed (before processing)
    // Uses messageId which is globally unique in Microsoft Graph
    if (await isNotificationProcessed(businessId, emailAddress, subscriptionId, messageId)) {
      monitoringLogger.debug('Notification already processed - skipping duplicate', {
        operation: 'microsoft-notify',
        metadata: { subscriptionId, messageId, businessId, emailAddress }
      });
      return;
    }

    // Mark as processed IMMEDIATELY to prevent race conditions
    // This happens before actual processing to ensure idempotency
    await markNotificationProcessed(businessId, emailAddress, subscriptionId, messageId);

    // Update last notification date
    await microsoftSubscriptionService.updateLastNotificationDate(businessId, emailAddress);

    // Process the email
    monitoringLogger.info('Processing Microsoft Graph notification', {
      operation: 'microsoft-notify',
      metadata: {
        emailAddress,
        businessId,
        messageId,
        changeType: item.changeType
      }
    });

    try {
      await microsoftEmailSyncService.processMessageNotification(
        businessId,
        emailRecord.id,
        emailAddress,
        messageId
      );
    } catch (err) {
      if (isRetryableGraphError(err)) {
        await unmarkNotificationProcessed(businessId, emailAddress, subscriptionId, messageId);
      }
      throw err; // still logged, still safe
    }

  } catch (error) {
    // Log error but continue processing other notifications
    // Don't throw - already sent 202 response
    monitoringLogger.error('Error processing individual notification', {
      operation: 'microsoft-notify',
      metadata: { subscriptionId: item?.subscriptionId || 'unknown' }
    }, error as Error);
  }
}

export default router;

