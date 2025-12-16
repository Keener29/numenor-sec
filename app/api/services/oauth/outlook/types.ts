/**
 * Outlook-specific OAuth Types
 * Types specific to Outlook OAuth implementation
 */

export interface OutlookMessage {
  id: string;
  subject: string;
  body: {
    contentType: string;
    content: string;
  };
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
}

export interface OutlookOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface OutlookAuthUrlOptions {
  response_type: 'code';
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  response_mode: 'query';
}

/**
 * Microsoft Graph API Types
 * Types for Microsoft Graph API requests and responses
 */

export interface GraphSubscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState?: string;
}

export interface GraphMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime: string;
  sender?: {
    emailAddress?: {
      address?: string;
      name?: string;
    };
  };
  toRecipients?: Array<{
    emailAddress?: {
      address?: string;
      name?: string;
    };
  }>;
  body?: {
    contentType: string;
    content: string;
  };
  internetMessageHeaders?: Array<{
    name: string;
    value: string;
  }>;
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    size: number;
  }>;
  webLink?: string;
}

export interface GraphNotification {
  value: Array<{
    subscriptionId: string;
    changeType: string;
    resource: string;
    resourceData?: {
      id?: string;
    };
    clientState?: string;
    subscriptionExpirationDateTime?: string;
    tenantId?: string;
  }>;
  validationTokens?: string[];
}
