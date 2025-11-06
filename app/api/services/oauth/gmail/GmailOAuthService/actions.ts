import { oauthLogger } from '../../../logger.js';
import { ErrorFactory, ErrorCodes } from '../../../errorHandler.js';
import { query } from '../../../../../db/connection.js';
import type { EmailMessage, LogContext } from '../../base/types.js';
import type { GmailMessage } from '../types.js';

type GmailClient = any;

export type SetCredentialsFn = (businessId: number, emailAddress: string) => Promise<void>;

export async function fetchEmails(
  setCredentials: SetCredentialsFn,
  gmail: GmailClient,
  businessId: number,
  emailAddress: string,
  maxResults: number = 10,
  searchQuery: string = '',
  parseGmailMessage: (message: GmailMessage, emailAddress?: string) => EmailMessage,
  connectionTimestamp?: Date
): Promise<EmailMessage[]> {
  const context: LogContext = {
    operation: 'fetch-emails',
    businessId,
    emailAddress,
    metadata: { maxResults, query: searchQuery }
  };
  try {
    await setCredentials(businessId, emailAddress);
    let gmailQuery = searchQuery;
    if (connectionTimestamp) {
      const connectionDate = connectionTimestamp.toISOString().split('T')[0].replace(/-/g, '/');
      gmailQuery = searchQuery.trim() ? `${searchQuery} after:${connectionDate}` : `after:${connectionDate}`;
      oauthLogger.debug('Fetching emails from Gmail after connection time', { ...context, metadata: { ...context.metadata, connectionTimestamp: connectionTimestamp.toISOString(), gmailQuery } });
    } else {
      oauthLogger.debug('Fetching emails from Gmail', context);
    }
    const response = await gmail.users.messages.list({ userId: 'me', maxResults, q: gmailQuery });
    const messages = response.data.messages || [];
    if (messages.length === 0) {
      oauthLogger.info('Email search completed - no matching messages', { ...context, metadata: { ...context.metadata, searchQuery, gmailQuery, totalMessages: 0 } });
      return [];
    }
    const messageResponses = await Promise.all(messages.map((m: { id: string }) => gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })));
    const gmailMessages = messageResponses.map(r => r.data);
    const emailMessages = gmailMessages.map(gm => parseGmailMessage(gm, emailAddress));
    oauthLogger.info('Successfully fetched emails from Gmail', { ...context, metadata: { ...context.metadata, emailCount: emailMessages.length } });
    return emailMessages;
  } catch (error) {
    oauthLogger.error('Failed to fetch emails from Gmail', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.GMAIL_API_ERROR, 'Failed to fetch emails from Gmail API');
  }
}

export async function markAsRead(
  setCredentials: SetCredentialsFn,
  gmail: GmailClient,
  businessId: number,
  emailAddress: string,
  messageId: string
): Promise<void> {
  const context: LogContext = { operation: 'mark-as-read', businessId, emailAddress, metadata: { messageId } };
  try {
    await setCredentials(businessId, emailAddress);
    await gmail.users.messages.modify({ userId: 'me', id: messageId, resource: { removeLabelIds: ['UNREAD'] } });
    oauthLogger.debug('Email marked as read successfully', context);
  } catch (error) {
    oauthLogger.error('Failed to mark email as read', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.GMAIL_API_ERROR, 'Failed to mark email as read');
  }
}

export async function deleteEmail(
  setCredentials: SetCredentialsFn,
  gmail: GmailClient,
  businessId: number,
  emailAddress: string,
  messageId: string
): Promise<void> {
  const context: LogContext = { operation: 'delete-email', businessId, emailAddress, metadata: { messageId } };
  try {
    await setCredentials(businessId, emailAddress);
    await gmail.users.messages.delete({ userId: 'me', id: messageId });
    oauthLogger.info('Email deleted successfully', context);
  } catch (error) {
    oauthLogger.error('Failed to delete email', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.GMAIL_API_ERROR, 'Failed to delete email');
  }
}

export async function moveToTrash(
  setCredentials: SetCredentialsFn,
  gmail: GmailClient,
  businessId: number,
  emailAddress: string,
  messageId: string
): Promise<void> {
  const context: LogContext = { operation: 'move-to-trash', businessId, emailAddress, metadata: { messageId } };
  try {
    await setCredentials(businessId, emailAddress);
    await gmail.users.messages.trash({ userId: 'me', id: messageId });
    oauthLogger.info('Email moved to trash successfully', context);
  } catch (error) {
    oauthLogger.error('Failed to move email to trash', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.GMAIL_API_ERROR, 'Failed to move email to trash');
  }
}

export async function testConnection(
  setCredentials: SetCredentialsFn,
  gmail: GmailClient,
  businessId: number,
  emailAddress: string,
  fetchEmailsFn: typeof fetchEmails,
  parseGmailMessage: (message: GmailMessage, emailAddress?: string) => EmailMessage
): Promise<{ success: boolean; message: string; emailCount?: number; emails?: Array<{ id: string; subject: string; sender: string }>; details?: string; }> {
  try {
    const tokenResult = await query('SELECT created_at FROM oauth_tokens WHERE business_id = $1 AND email_address = $2 AND provider = $3', [businessId, emailAddress, 'gmail']);
    const connectionTimestamp = tokenResult.rows.length > 0 ? (tokenResult.rows[0] as any).created_at : undefined;
    const emails = await fetchEmailsFn(setCredentials, gmail, businessId, emailAddress, 5, '', parseGmailMessage, connectionTimestamp);
    return { success: true, message: 'Gmail connection test successful', emailCount: emails.length, emails: emails.map(e => ({ id: e.id, subject: e.subject, sender: e.sender })) };
  } catch (error) {
    return { success: false, message: 'Gmail connection test failed', details: error instanceof Error ? error.message : 'Unknown error' };
  }
}


