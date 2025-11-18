import { oauthLogger } from '../../../logger.js';
import { ErrorFactory, ErrorCodes } from '../../../errorHandler.js';
import { query } from '../../../../../db/connection.js';
import type { EmailMessage, LogContext } from '../../base/types.js';
import type { GmailMessage } from '../types.js';
import { decodeHtmlEntities, stripHtmlTags } from '../../../../utils/emailUtils.js';

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

/**
 * Extract HTML and plain text separately from a Gmail message
 */
export function extractHtmlAndPlainText(message: GmailMessage): { html: string; plainText: string } {
  let html = '';
  let plainText = '';
  
  const extractFromParts = (parts: any[]): void => {
    for (const part of parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        html += Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.mimeType === 'text/plain' && part.body?.data) {
        plainText += Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  };
  
  if (message.payload.body?.data) {
    // Single-part message
    const body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    if (message.payload.mimeType === 'text/html') {
      html = body;
      // Create plain text version by stripping HTML tags
      plainText = decodeHtmlEntities(stripHtmlTags(body)).trim();
    } else {
      plainText = body;
      html = body.replace(/\n/g, '<br>');
    }
  } else if (message.payload.parts) {
    extractFromParts(message.payload.parts);
  }
  
  // Fallback: if no HTML found but plain text exists, use plain text for both
  if (!html && plainText) {
    html = plainText.replace(/\n/g, '<br>');
  }
  // Fallback: if no plain text found but HTML exists, strip HTML tags
  if (!plainText && html) {
    plainText = decodeHtmlEntities(stripHtmlTags(html)).trim();
  }
  
  return { html: html || '', plainText: plainText || '' };
}

/**
 * Create a draft email with modified HTML and plain text content
 */
export async function createDraftWithContent(
  setCredentials: SetCredentialsFn,
  gmail: GmailClient,
  businessId: number,
  emailAddress: string,
  originalMessage: GmailMessage,
  modifiedHtml: string,
  modifiedPlainText: string,
  subject: string,
  from: string,
  to: string
): Promise<string> {
  const context: LogContext = {
    operation: 'create-draft-with-content',
    businessId,
    emailAddress,
    metadata: { originalMessageId: originalMessage.id, subject }
  };
  
  try {
    await setCredentials(businessId, emailAddress);
    
    // Create multipart MIME message with both HTML and plain text
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const messageParts = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      modifiedPlainText,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      modifiedHtml,
      ``,
      `--${boundary}--`
    ];
    
    const rawMessage = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedMessage,
          threadId: originalMessage.threadId // Link to original thread
        }
      }
    });
    
    oauthLogger.info('Draft created successfully with phishing banner', {
      ...context,
      metadata: {
        ...context.metadata,
        draftId: response.data.id
      }
    });
    
    return response.data.id;
  } catch (error) {
    oauthLogger.error('Failed to create draft with modified content', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.GMAIL_API_ERROR, 'Failed to create draft email');
  }
}


