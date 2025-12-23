/**
 * Base OAuth Provider Interface
 * Abstract base class that all OAuth providers must implement
 */

import type {
  OAuthTokens,
  OAuthState,
  OAuthConnectionStatus,
  EmailMessage,
  OAuthProviderType
} from './types.js';

export abstract class OAuthProvider {
  protected providerType: OAuthProviderType;

  constructor(providerType: OAuthProviderType) {
    this.providerType = providerType;
  }

  /**
   * Get the provider type
   */
  getProviderType(): OAuthProviderType {
    return this.providerType;
  }

  /**
   * Generate OAuth authorization URL
   */
  abstract generateAuthUrl(businessId: number, emailAddress: string): Promise<string>;

  /**
   * Exchange authorization code for tokens
   */
  abstract exchangeCodeForTokens(code: string): Promise<OAuthTokens>;

  /**
   * Store OAuth tokens in database
   */
  abstract storeTokens(
    businessId: number,
    emailAddress: string,
    tokens: OAuthTokens
  ): Promise<void>;

  /**
   * Get stored OAuth tokens for an email
   */
  abstract getTokens(businessId: number, emailAddress: string): Promise<OAuthTokens | null>;

  /**
   * Refresh access token if needed
   */
  abstract refreshTokenIfNeeded(businessId: number, emailAddress: string): Promise<OAuthTokens>;

  /**
   * Set OAuth credentials for API calls
   */
  abstract setCredentials(businessId: number, emailAddress: string): Promise<void>;

  /**
   * Fetch emails from the provider
   */
  abstract fetchEmails(
    businessId: number,
    emailAddress: string,
    maxResults?: number,
    query?: string,
    connectionTimestamp?: Date
  ): Promise<EmailMessage[]>;

  /**
   * Delete an email message
   */
  abstract deleteEmail(businessId: number, emailAddress: string, messageId: string): Promise<void>;

  /**
   * Move an email to trash (soft delete)
   */
  abstract moveToTrash(businessId: number, emailAddress: string, messageId: string): Promise<void>;

  /**
   * Get OAuth connection status
   */
  abstract getConnectionStatus(businessId: number, emailAddress: string): Promise<OAuthConnectionStatus>;

  /**
   * Disconnect OAuth for an email
   */
  abstract disconnect(businessId: number, emailAddress: string): Promise<void>;

  /**
   * Validate OAuth state parameter
   */
  abstract validateState(state: string): Promise<OAuthState>;

  /**
   * Test OAuth connection
   */
  abstract testConnection(businessId: number, emailAddress: string): Promise<{
    success: boolean;
    message: string;
    emailCount?: number;
    emails?: Array<{ id: string; subject: string; sender: string }>;
  }>;
}
