/**
 * Gmail-specific OAuth Types
 * Types specific to Gmail OAuth implementation
 */

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  payload: GmailMessagePayload;
  sizeEstimate: number;
  raw?: string;
}

export interface DraftContentOptions {
  businessId: number;
  emailAddress: string;
  originalMessage: GmailMessage;
  modifiedHtml: string;
  modifiedPlainText: string;
  subject: string;
  from: string;
  to: string;
}

export interface GmailMessagePayload {
  partId: string;
  mimeType: string;
  filename: string;
  headers: GmailHeader[];
  body: GmailBody;
  parts?: GmailMessagePayload[];
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailBody {
  attachmentId?: string;
  size: number;
  data?: string;
}

export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface GmailAuthUrlOptions {
  access_type: 'online' | 'offline';
  scope: string[];
  state: string;
  prompt: 'none' | 'consent' | 'select_account';
}
