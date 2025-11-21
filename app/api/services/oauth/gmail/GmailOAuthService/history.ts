import { oauthLogger } from '../../../logger.js';
import { ErrorFactory, ErrorCodes } from '../../../errorHandler.js';
import type { EmailMessage, LogContext } from '../../base/types.js';
import type { GmailMessage } from '../types.js';
import type { gmail_v1 } from 'googleapis';

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
    timestamp: new Date(Number.parseInt(message.internalDate)),
    links,
    headers,
    labels: message.labelIds || []
  };
}
async function fetchHistoryPages(
  gmail: GmailClient,
  startHistoryId: string
): Promise<{ entries: gmail_v1.Schema$History[]; latestHistoryId: string }> {
  const entries: gmail_v1.Schema$History[] = [];
  let latestHistoryId = startHistoryId;
  let pageToken: string | undefined;

  do {
    const res = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      historyTypes: ['messageAdded', 'labelAdded'],
      maxResults: 100,
      pageToken,
    });

    const history = res.data.history || [];
    entries.push(...history);

    for (const h of history) {
      if (h.id) latestHistoryId = String(h.id);
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return { entries, latestHistoryId };
}

function isCorrectInboxMessage(message: gmail_v1.Schema$Message | undefined): boolean {
  if (!message || !message.id) return false;
  const labelIds = message.labelIds || [];
  return labelIds.includes('INBOX') &&
    !labelIds.includes('SENT') &&
    !labelIds.includes('TRASH') &&
    !labelIds.includes('DRAFT');
}

function extractMessageIdFromHistoryEntry(entry: gmail_v1.Schema$HistoryMessageAdded[] | gmail_v1.Schema$HistoryLabelAdded[], ids: Set<string>): void {
  for (const added of entry) {
    const msg = added.message;
    if (isCorrectInboxMessage(msg)) {
      ids.add(msg!.id!);
    }
  }
}

function extractMessageIdsFromHistory(entries: gmail_v1.Schema$History[]): string[] {
  const ids = new Set<string>();

  for (const entry of entries) {
    if (entry.messagesAdded) {
      extractMessageIdFromHistoryEntry(entry.messagesAdded, ids);
    }
    if (entry.labelsAdded) {
      extractMessageIdFromHistoryEntry(entry.labelsAdded, ids);
    }
  }

  return Array.from(ids);
}
function normalizeGmailErrors(error: any, context: LogContext): Error {
  const message = (error?.message || error?.errors?.[0]?.message || '').toLowerCase();

  const isTooOld =
    error?.code === 404 ||
    (message.includes('history') && message.includes('old'));

  if (isTooOld) {
    const err = new Error('Gmail historyId too old');
    (err as any).causeCode = 'HISTORY_TOO_OLD';
    return err;
  }

  oauthLogger.error('Failed to list Gmail history', context, error as Error);
  return ErrorFactory.oauthService(
    ErrorCodes.GMAIL_API_ERROR,
    'Failed to list Gmail history'
  );
}


export async function listHistorySince(
  setCredentials: SetCredentialsFn,
  gmail: GmailClient,
  businessId: number,
  emailAddress: string,
  startHistoryId: string
): Promise<{ messageIds: string[]; latestHistoryId: string }> {
  const context: LogContext = {
    operation: 'list-history-since',
    businessId,
    emailAddress,
    metadata: { startHistoryId }
  };

  try {
    await setCredentials(businessId, emailAddress);

    const { entries, latestHistoryId } = await fetchHistoryPages(
      gmail,
      startHistoryId
    );

    const messageIds = extractMessageIdsFromHistory(entries);

    oauthLogger.debug('Gmail history listed successfully', {
      ...context,
      metadata: { ...context.metadata, messageCount: messageIds.length, latestHistoryId }
    });

    return { messageIds, latestHistoryId };
  } catch (err: any) {
    throw normalizeGmailErrors(err, context);
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


