/**
 * Microsoft Email Adapter
 * Normalizes Microsoft Graph messages to internal EmailMessage format
 */

import type { EmailMessage } from '../../../types/email.js';
import type { GraphMessage } from './types.js';
import { extractAnchors } from '../../../utils/tagExtractor.js';

/**
 * Extract body content from Graph message
 * Prioritizes body.content, falls back to bodyPreview
 */
function extractBodyContent(message: GraphMessage): string {
  // If body exists, prefer its content, fallback to bodyPreview
  if (message.body?.content) {
    return message.body.content;
  }
  
  // Fallback to bodyPreview if available
  if (message.bodyPreview) {
    return message.bodyPreview;
  }
  
  return '';
}

/**
 * Extract all URLs from HTML body (both anchor tags and regex matches)
 * Returns deduplicated array of URLs while preserving order
 */
function extractLinksFromBody(body: string): string[] {
  const links: string[] = [];
  if (!body) {
    return links;
  }

  // Extract URLs from <a href> tags using shared utility
  const anchors = extractAnchors(body);
  for (const anchor of anchors) {
    links.push(anchor.href);
  }

  // Also extract URLs using regex (catches URLs not in anchor tags)
  const urlRegex = /https?:\/\/[^\s<>":{}|\\^`[\]]+/g;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlRegex.exec(body)) !== null) {
    links.push(urlMatch[0]);
  }

  // Remove duplicates while preserving order
  return Array.from(new Set(links));
}

/**
 * Parse Microsoft Graph message into internal EmailMessage format
 */
export function parseGraphMessage(
  message: GraphMessage,
  emailAddress?: string
): EmailMessage {
  // Extract headers from internetMessageHeaders
  const headers: Record<string, string> = {};
  if (message.internetMessageHeaders) {
    for (const header of message.internetMessageHeaders) {
      const name = header.name.toLowerCase();
      // Keep first occurrence of each header
      if (!headers[name]) {
        headers[name] = header.value;
      }
    }
  }

  // Extract subject
  const subject = message.subject || 'No Subject';

  // Extract sender - prefer 'from' (what user sees) over 'sender' (actual sender)
  // This is critical for phishing detection: 'from' is what the user trusts
  // 'sender' can differ when emails are sent "on behalf of" someone (delegation)
  const senderEmail = message.from?.emailAddress?.address || message.sender?.emailAddress?.address || '';
  const senderName = message.from?.emailAddress?.name || message.sender?.emailAddress?.name || '';
  const sender = senderName ? `${senderName} <${senderEmail}>` : senderEmail || 'Unknown Sender';

  // Extract recipient
  const recipientEmail = message.toRecipients?.[0]?.emailAddress?.address || emailAddress || 'Unknown Recipient';
  const recipientName = message.toRecipients?.[0]?.emailAddress?.name || '';
  const recipient = recipientName ? `${recipientName} <${recipientEmail}>` : recipientEmail;

  // Extract body
  const body = extractBodyContent(message);

  // Extract links from HTML body
  const links = extractLinksFromBody(body);

  // Extract attachments
  const attachments: string[] = [];
  if (message.attachments) {
    for (const attachment of message.attachments) {
      attachments.push(attachment.name || attachment.id);
    }
  }

  // Parse timestamp
  const timestamp = message.receivedDateTime
    ? new Date(message.receivedDateTime)
    : new Date();

  return {
    id: message.id,
    subject,
    body: body || '',
    sender,
    recipient,
    timestamp,
    links,
    headers,
    attachments: attachments.length > 0 ? attachments : undefined,
    threadId: message.id, // Graph doesn't expose threadId directly, use message ID
  };
}
