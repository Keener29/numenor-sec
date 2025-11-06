import { oauthLogger } from '../../../logger.js';
import { ErrorFactory, ErrorCodes } from '../../../errorHandler.js';
import type { EmailMessage, LogContext } from '../../base/types.js';
import type { GmailMessage } from '../types.js';

type GmailClient = any;
export type SetCredentialsFn = (businessId: number, emailAddress: string) => Promise<void>;

/**
 * Parse a raw Gmail API message into the app's EmailMessage shape.
 * - Decodes base64 bodies (single-part or multipart with text/plain or text/html parts)
 * - Extracts common headers and a best-effort link list from the body
 */
export function parseGmailMessage(message: GmailMessage, emailAddress?: string): EmailMessage {
  // Normalize headers to a lower-cased map for easier downstream access
  const headers = message.payload.headers.reduce((acc: Record<string, string>, header: any) => {
    acc[header.name.toLowerCase()] = header.value;
    return acc;
  }, {} as Record<string, string>);

  let body = '';
  if (message.payload.body.data) {
    // Single-part message with inline base64 data
    body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
  } else if (message.payload.parts) {
    // Multipart message: accumulate text parts (plain and/or HTML)
    for (const part of message.payload.parts) {
      if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
        if (part.body.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
    }
  }

  // Lightweight URL extraction; not a full HTML parser by design
  const linkRegex = /https?:\/\/[^\s<>":{}|\\^`\[\]]+/g;
  const links = body.match(linkRegex) || [];

  return {
    id: message.id,
    subject: headers.subject || 'No Subject',
    body: body || message.snippet,
    sender: headers.from || 'Unknown Sender',
    recipient: headers.to || emailAddress || 'Unknown Recipient',
    timestamp: new Date(parseInt(message.internalDate)),
    links,
    headers,
    labels: message.labelIds || []
  };
}

export async function listHistorySince(
  setCredentials: SetCredentialsFn,
  gmail: GmailClient,
  businessId: number,
  emailAddress: string,
  startHistoryId: string
): Promise<{ messageIds: string[]; latestHistoryId: string }> {
  const context: LogContext = { operation: 'list-history-since', businessId, emailAddress, metadata: { startHistoryId } };
  try {
    // Ensure Gmail client is authorized for this mailbox before listing history
    await setCredentials(businessId, emailAddress);
    // Collect unique messageIds that represent new inbox messages
    const collectedIds = new Set<string>();
    let latestHistoryId = startHistoryId;
    let pageToken: string | undefined = undefined;
    // Gmail returns history in pages; iterate until no nextPageToken
    do {
      const res = await gmail.users.history.list({ userId: 'me', startHistoryId, historyTypes: ['messageAdded', 'labelAdded'], maxResults: 100, pageToken });
      const history = res.data.history || [];
      for (const entry of history) {
        // Track the most recent historyId observed to advance our anchor safely
        if (entry.id) latestHistoryId = String(entry.id);
        if (entry.messagesAdded) {
          for (const added of entry.messagesAdded) {
            const msg = added.message;
            if (!msg || !msg.id) continue;
            const labelIds: string[] = msg.labelIds || [];
            // Only consider messages that landed in INBOX, and exclude sent/drafts to avoid self-sends
            if (labelIds.includes('INBOX') && !labelIds.includes('SENT') && !labelIds.includes('DRAFT')) {
              collectedIds.add(msg.id);
            }
          }
        }
        if (entry.labelsAdded) {
          for (const lab of entry.labelsAdded) {
            const msg = lab.message;
            if (!msg || !msg.id) continue;
            const labelIds: string[] = (lab.labelIds as string[]) || [];
            // Handle messages moved into INBOX after arrival (e.g., rule changes)
            if (labelIds.includes('INBOX')) collectedIds.add(msg.id);
          }
        }
      }
      pageToken = res.data.nextPageToken as string | undefined;
    } while (pageToken);
    oauthLogger.debug('Gmail history listed successfully', { ...context, metadata: { ...context.metadata, messageCount: collectedIds.size, latestHistoryId } });
    return { messageIds: Array.from(collectedIds), latestHistoryId };
  } catch (error: any) {
    // Gmail signals anchor invalidation when the history window expired (e.g., 404 or error text mentioning "history ... old")
    const message = (error && (error.message || error.errors?.[0]?.message)) || '';
    if (error?.code === 404 || (/history/i.test(message) && /old/i.test(message))) {
      const err = new Error('Gmail historyId too old');
      (err as any).causeCode = 'HISTORY_TOO_OLD';
      throw err;
    }
    oauthLogger.error('Failed to list Gmail history', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.GMAIL_API_ERROR, 'Failed to list Gmail history');
  }
}

export async function getCurrentHistoryId(
  setCredentials: SetCredentialsFn,
  gmail: GmailClient,
  businessId: number,
  emailAddress: string
): Promise<string> {
  const context: LogContext = { operation: 'get-current-history-id', businessId, emailAddress };
  try {
    // Authorize client, then fetch current mailbox profile which includes the latest historyId
    await setCredentials(businessId, emailAddress);
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const historyId = profile?.data?.historyId;
    if (!historyId) throw new Error('Missing historyId in Gmail profile');
    return String(historyId);
  } catch (error) {
    oauthLogger.error('Failed to get current Gmail historyId', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.GMAIL_API_ERROR, 'Failed to get current Gmail historyId');
  }
}

export async function getMessagesByIds(
  setCredentials: SetCredentialsFn,
  gmail: GmailClient,
  businessId: number,
  emailAddress: string,
  messageIds: string[],
  parseGmailMessage: (message: GmailMessage, emailAddress?: string) => EmailMessage
): Promise<EmailMessage[]> {
  const context: LogContext = { operation: 'get-messages-by-ids', businessId, emailAddress, metadata: { count: messageIds.length } };
  try {
    if (messageIds.length === 0) return [];
    // Ensure credentials; then fetch all message details in parallel
    await setCredentials(businessId, emailAddress);
    const responses = await Promise.all(messageIds.map((id) => gmail.users.messages.get({ userId: 'me', id, format: 'full' })));
    const gmailMessages = responses.map(r => r.data);
    // Convert raw Gmail messages into the app's EmailMessage structure
    const parsed = gmailMessages.map(m => parseGmailMessage(m, emailAddress));
    oauthLogger.debug('Fetched messages by ids successfully', context);
    return parsed;
  } catch (error) {
    oauthLogger.error('Failed to fetch messages by ids', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.GMAIL_API_ERROR, 'Failed to fetch messages by ids');
  }
}


