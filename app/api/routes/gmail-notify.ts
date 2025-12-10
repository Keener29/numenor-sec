/**
 * Gmail Pub/Sub Webhook Route
 * Receives push notifications from Google Cloud Pub/Sub when Gmail messages arrive
 */

import { Router, type Request, type Response } from 'express';
import { query } from '../../db/connection.js';
import { gmailOAuthService } from '../services/oauth/gmail/GmailOAuthService.js';
import { emailMonitor } from '../services/emailMonitor.js';
import { pubsubService } from '../services/pubsub/pubsubService.js';
import { monitoringLogger } from '../../utils/logger.js';

const router = Router();

/**
 * Pub/Sub push message format:
 * {
 *   "message": {
 *     "data": "base64-encoded-string",
 *     "messageId": "string",
 *     "publishTime": "RFC3339 timestamp"
 *   },
 *   "subscription": "projects/{project}/subscriptions/{subscription}"
 * }
 * 
 * Decoded message.data contains:
 * {
 *   "emailAddress": "user@example.com",
 *   "historyId": "1234567890"
 * }
 */

interface PubSubMessage {
  message: {
    data: string;
    messageId: string;
    publishTime: string;
    attributes?: Record<string, string>;
  };
  subscription: string;
}

interface GmailNotification {
  emailAddress: string;
  historyId: string;
}

interface EmailRecord {
  id: number;
  business_id: number;
  email_address: string;
}

/**
 * Verify and decode Pub/Sub message
 * Receives raw Buffer body from express.raw() middleware
 */
function decodePubSubMessage(body: Buffer): GmailNotification | null {
  let pubsubMessage: PubSubMessage;

  try {
    // Parse JSON from raw buffer (Pub/Sub sends JSON with Base64-encoded data field)
    const bodyString = body.toString('utf-8');
    pubsubMessage = JSON.parse(bodyString) as PubSubMessage;
  } catch (error) {
    monitoringLogger.error('Failed to parse Pub/Sub message JSON', {
      operation: 'gmail-notify'
    }, error as Error);
    return null;
  }

  // Verify message structure
  if (!pubsubService.verifyMessage(pubsubMessage)) {
    monitoringLogger.warn('Invalid Pub/Sub message structure', {
      operation: 'gmail-notify',
      metadata: { hasMessage: !!pubsubMessage.message, hasData: !!pubsubMessage.message?.data }
    });
    return null;
  }

  try {
    // Decode Base64url-encoded data field (Gmail uses base64url, not base64)
    // Base64url uses - and _ instead of + and /, and may omit padding
    let base64Data = pubsubMessage.message.data;
    // Convert base64url to base64: replace - with + and _ with /
    base64Data = base64Data.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed (base64url may omit padding)
    while (base64Data.length % 4) {
      base64Data += '=';
    }
    const decodedData = Buffer.from(base64Data, 'base64').toString('utf-8');
    
    // Log decoded data for debugging (first 500 chars)
    monitoringLogger.info('Decoded Pub/Sub message data', {
      operation: 'gmail-notify',
      metadata: {
        decodedPreview: decodedData.substring(0, 500),
        decodedLength: decodedData.length,
        firstChar: decodedData.charAt(0),
        looksLikeJson: decodedData.trim().startsWith('{') || decodedData.trim().startsWith('[')
      }
    });

    // Try to parse as JSON
    let notification: GmailNotification;
    try {
      notification = JSON.parse(decodedData) as GmailNotification;
    } catch (parseError) {
      // If it's not JSON, it might be a test message or different format
      monitoringLogger.warn('Pub/Sub message data is not JSON', {
        operation: 'gmail-notify',
        metadata: {
          decodedPreview: decodedData.substring(0, 200),
          error: parseError instanceof Error ? parseError.message : String(parseError)
        }
      });
      
      // Check if it's a test message (Pub/Sub sends "Hello World" or similar for testing)
      if (decodedData.toLowerCase().includes('hello') || decodedData.toLowerCase().includes('test')) {
        monitoringLogger.info('Received Pub/Sub test message - ignoring', {
          operation: 'gmail-notify',
          metadata: { message: decodedData.substring(0, 100) }
        });
        return null; // Ignore test messages
      }
      
      return null;
    }

    if (!notification.emailAddress || !notification.historyId) {
      monitoringLogger.warn('Invalid notification data', {
        operation: 'gmail-notify',
        metadata: { emailAddress: notification.emailAddress, historyId: notification.historyId }
      });
      return null;
    }

    return notification;
  } catch (error) {
    monitoringLogger.error('Failed to decode Base64 payload from Pub/Sub message', {
      operation: 'gmail-notify',
      metadata: {
        error: error instanceof Error ? error.message : String(error),
        hasMessage: !!pubsubMessage.message,
        hasData: !!pubsubMessage.message?.data
      }
    }, error as Error);
    return null;
  }
}

/**
 * Find monitored email record for the given email address
 */
async function findMonitoredEmail(emailAddress: string): Promise<EmailRecord | null> {
  const emailResult = await query(
    `SELECT me.id, me.business_id, me.email_address
     FROM monitored_emails me
     INNER JOIN oauth_tokens ot ON me.business_id = ot.business_id AND me.email_address = ot.email_address
     WHERE me.email_address = $1`,
    [emailAddress]
  );

  if (emailResult.rows.length === 0) {
    return null;
  }

  return emailResult.rows[0] as EmailRecord;
}

/**
 * Get stored historyId for an email, or null if not found
 */
async function getStoredHistoryId(businessId: number, emailAddress: string): Promise<string | null> {
  const offsetResult = await query(
    'SELECT last_history_id FROM email_offsets WHERE business_id = $1 AND email_address = $2 AND provider = $3',
    [businessId, emailAddress, 'gmail']
  );

  if (offsetResult.rows.length === 0) {
    return null;
  }

  return (offsetResult.rows[0] as { last_history_id: string | null }).last_history_id;
}

/**
 * Store historyId in database
 */
async function storeHistoryId(businessId: number, emailAddress: string, historyId: string): Promise<void> {
  await query(
    `INSERT INTO email_offsets (business_id, email_address, provider, last_history_id, last_synced_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (business_id, email_address, provider)
     DO UPDATE SET last_history_id = EXCLUDED.last_history_id, last_synced_at = CURRENT_TIMESTAMP`,
    [businessId, emailAddress, 'gmail', historyId]
  );
}

/**
 * Initialize historyId for first-time processing
 */
async function initializeHistoryId(businessId: number, emailAddress: string): Promise<string> {
  const currentHistoryId = await gmailOAuthService.getCurrentHistoryId(businessId, emailAddress);
  await storeHistoryId(businessId, emailAddress, currentHistoryId);
  
  monitoringLogger.info('Initialized historyId for email', {
    operation: 'gmail-notify',
    metadata: { emailAddress, historyId: currentHistoryId }
  });

  return currentHistoryId;
}

/**
 * Process emails and handle errors with fallback
 */
async function processEmailsWithFallback(
  businessId: number,
  emailId: number,
  emailAddress: string,
  lastHistoryId: string,
  newHistoryId: string
): Promise<void> {
  try {
    await emailMonitor.processNewEmailsFromHistory(
      businessId,
      emailId,
      emailAddress,
      lastHistoryId,
      newHistoryId
    );
    await storeHistoryId(businessId, emailAddress, newHistoryId);
  } catch (error: any) {
    // If historyId is too old, fall back to full sync
    if (error?.causeCode === 'HISTORY_TOO_OLD') {
      monitoringLogger.warn('HistoryId too old, performing full sync', {
        operation: 'gmail-notify',
        metadata: { emailAddress, lastHistoryId, newHistoryId }
      });

      await emailMonitor.performFullSyncFallback(businessId, emailId, emailAddress);
      await storeHistoryId(businessId, emailAddress, newHistoryId);
    } else {
      throw error;
    }
  }
}

/**
 * @route POST /api/gmail-notify
 * @desc Receive Gmail push notifications from Pub/Sub
 * @access Public (authenticated via Pub/Sub OIDC token)
 */
router.post('/', async (req: Request, res: Response) => {
  // Log all incoming requests to debug Pub/Sub delivery
  monitoringLogger.info('Webhook endpoint called', {
    operation: 'gmail-notify',
    metadata: {
      method: req.method,
      path: req.path,
      contentType: req.headers['content-type'],
      hasBody: !!req.body,
      bodyType: typeof req.body,
      bodyLength: req.body ? (req.body as Buffer).length : 0
    }
  });

  try {
    // req.body is a Buffer from express.raw() middleware
    // Pub/Sub sends JSON with Base64-encoded message.data field
    const notification = decodePubSubMessage(req.body as Buffer);
    if (!notification) {
      // Test messages or invalid messages - acknowledge with 200 to prevent redelivery
      // Pub/Sub requires 200-299 status codes to acknowledge messages
      monitoringLogger.debug('Acknowledging test/invalid Pub/Sub message', {
        operation: 'gmail-notify',
        metadata: {
          bodyPreview: req.body ? (req.body as Buffer).toString('utf8').substring(0, 200) : 'no body'
        }
      });
      return res.status(200).json({ status: 'acknowledged', reason: 'test_or_invalid_message' });
    }

    const { emailAddress, historyId } = notification;

    monitoringLogger.info('Received Gmail push notification', {
      operation: 'gmail-notify',
      metadata: { emailAddress, historyId }
    });

    // Find monitored email record
    const emailRecord = await findMonitoredEmail(emailAddress);
    if (!emailRecord) {
      monitoringLogger.warn('No monitored email found for notification', {
        operation: 'gmail-notify',
        metadata: { emailAddress }
      });
      // Acknowledge to prevent redelivery
      return res.status(200).json({ success: true, message: 'Email not monitored' });
    }

    const { business_id: businessId, id: emailId } = emailRecord;

    // Get or initialize historyId
    let lastHistoryId = await getStoredHistoryId(businessId, emailAddress);
    if (!lastHistoryId) {
      // First notification - do a full sync to catch the email that triggered it
      // Then store the notification's historyId as the baseline for future notifications
      monitoringLogger.info('First notification received - performing full sync', {
        operation: 'gmail-notify',
        metadata: { emailAddress, notificationHistoryId: historyId }
      });
      
      try {
        await emailMonitor.performFullSyncFallback(businessId, emailId, emailAddress);
        await storeHistoryId(businessId, emailAddress, historyId);
        
        monitoringLogger.info('Full sync completed for first notification', {
          operation: 'gmail-notify',
          metadata: { emailAddress, historyId }
        });
        
        return res.status(200).json({ success: true, message: 'Full sync completed' });
      } catch (error) {
        monitoringLogger.error('Full sync failed during initialization', {
          operation: 'gmail-notify',
          metadata: { emailAddress }
        }, error as Error);
        return res.status(500).json({ error: 'Full sync failed' });
      }
    }

    // Process emails (only if historyId has changed)
    if (lastHistoryId === historyId) {
      monitoringLogger.debug('HistoryId unchanged, no new emails to process', {
        operation: 'gmail-notify',
        metadata: { emailAddress, historyId }
      });
      return res.status(200).json({ success: true, message: 'No new emails' });
    }

    try {
      await processEmailsWithFallback(businessId, emailId, emailAddress, lastHistoryId, historyId);

      monitoringLogger.info('Successfully processed Gmail notification', {
        operation: 'gmail-notify',
        metadata: { emailAddress, historyId }
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      monitoringLogger.error('Error processing Gmail notification', {
        operation: 'gmail-notify',
        metadata: { emailAddress, historyId }
      }, error as Error);
      return res.status(500).json({ error: 'Failed to process notification' });
    }
  } catch (error) {
    monitoringLogger.error('Unexpected error in Gmail notification handler', {
      operation: 'gmail-notify'
    }, error as Error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

