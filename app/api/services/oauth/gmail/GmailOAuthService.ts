/**
 * Gmail OAuth Service
 * Handles Gmail OAuth 2.0 integration with proper error handling and security
 */

import { google } from 'googleapis';
import { oauthLogger } from '../../../../utils/logger.js';
import { ErrorFactory, ErrorCodes } from '../../errorHandler.js';
import * as Auth from './GmailOAuthService/auth.js';
import * as Actions from './GmailOAuthService/actions.js';
import * as History from './GmailOAuthService/history.js';
import * as Watch from './GmailOAuthService/watch.js';
import { OAuthProvider } from '../base/OAuthProvider.js';
import type {
  OAuthTokens,
  OAuthState,
  OAuthConnectionStatus,
  EmailMessage,
} from '../base/types.js';
import type {
  GmailMessage, DraftContentOptions,
  FetchEmailsOptions
} from './types.js';


export class GmailOAuthService extends OAuthProvider {
  private oauth2Client: any;
  private gmail: any;

  constructor() {
    super('gmail');
    this.initializeOAuthClient();
  }

  /**
   * Initialize OAuth 2.0 client
   */
  private initializeOAuthClient(): void {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret) {
      throw ErrorFactory.oauthService(
        ErrorCodes.OAUTH_CONFIGURATION_ERROR,
        'OAuth configuration missing. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
      );
    }

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

    oauthLogger.info('Gmail OAuth service initialized successfully', {
      operation: 'initialize-oauth-client',
      metadata: {
        clientIdLength: clientId.length,
        redirectUri
      }
    });
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(businessId: number, emailAddress: string): string {
    return Auth.generateAuthUrl(this.oauth2Client, businessId, emailAddress);
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    return Auth.exchangeCodeForTokens(this.oauth2Client, code);
  }

  /**
   * Store OAuth tokens in database
   */
  async storeTokens(businessId: number, emailAddress: string, tokens: OAuthTokens): Promise<void> {
    await Auth.storeTokens(businessId, emailAddress, tokens);
  }

  /**
   * Get stored OAuth tokens for an email
   */
  async getTokens(businessId: number, emailAddress: string): Promise<OAuthTokens | null> {
    return Auth.getTokens(businessId, emailAddress);
  }

  /**
   * Refresh access token if needed
   */
  async refreshTokenIfNeeded(businessId: number, emailAddress: string): Promise<OAuthTokens> {
    return Auth.refreshTokenIfNeeded(this.oauth2Client, businessId, emailAddress);
  }

  /**
   * Set OAuth credentials for API calls
   */
  async setCredentials(businessId: number, emailAddress: string): Promise<void> {
    return Auth.setCredentials(this.oauth2Client, businessId, emailAddress);
  }

  /**
   * Fetch emails from Gmail
   */
  async fetchEmails(
    businessId: number,
    emailAddress: string,
    maxResults: number = 10,
    searchQuery: string = '',
    connectionTimestamp?: Date
  ): Promise<EmailMessage[]> {
    const fetchEmailsOptions: FetchEmailsOptions = {
      setCredentials: this.setCredentials.bind(this),
      gmail: this.gmail,
      businessId,
      emailAddress,
      maxResults,
      searchQuery,
      parseGmailMessage: History.parseGmailMessage,
      connectionTimestamp
    };
    return Actions.fetchEmails(fetchEmailsOptions);
  }

  /**
   * Mark email as read
   */
  async markAsRead(businessId: number, emailAddress: string, messageId: string): Promise<void> {
    return Actions.markAsRead(this.setCredentials.bind(this), this.gmail, businessId, emailAddress, messageId);
  }

  /**
   * Delete an email message
   */
  async deleteEmail(businessId: number, emailAddress: string, messageId: string): Promise<void> {
    return Actions.deleteEmail(this.setCredentials.bind(this), this.gmail, businessId, emailAddress, messageId);
  }

  /**
   * Move an email to trash (soft delete)
   */
  async moveToTrash(businessId: number, emailAddress: string, messageId: string): Promise<void> {
    return Actions.moveToTrash(this.setCredentials.bind(this), this.gmail, businessId, emailAddress, messageId);
  }

  /**
   * Get OAuth connection status
   */
  async getConnectionStatus(businessId: number, emailAddress: string): Promise<OAuthConnectionStatus> {
    return Auth.getConnectionStatus(businessId, emailAddress);
  }

  /**
   * Disconnect OAuth for an email
   */
  async disconnect(businessId: number, emailAddress: string): Promise<void> {
    return Auth.disconnect(businessId, emailAddress);
  }

  /**
   * Validate OAuth state parameter
   */
  validateState(state: string): OAuthState {
    return Auth.validateState(state);
  }

  /**
   * Test OAuth connection
   */
  async testConnection(businessId: number, emailAddress: string): Promise<{
    success: boolean;
    message: string;
    emailCount?: number;
    emails?: Array<{ id: string; subject: string; sender: string }>;
    details?: string;
  }> {
    return Actions.testConnection(
      this.setCredentials.bind(this),
      this.gmail,
      businessId,
      emailAddress,
      Actions.fetchEmails,
      History.parseGmailMessage
    );
  }

  /**
   * Parse Gmail message to extract content
   */
  parseGmailMessage(message: GmailMessage, emailAddress?: string): EmailMessage {
    return History.parseGmailMessage(message, emailAddress);
  }

  /**
   * List Gmail history changes since a given historyId
   * Returns unique messageIds that were added to INBOX and the latest historyId
   */
  async listHistorySince(
    businessId: number,
    emailAddress: string,
    startHistoryId: string
  ): Promise<{ messageIds: string[]; latestHistoryId: string }> {
    return History.listHistorySince(this.setCredentials.bind(this), this.gmail, businessId, emailAddress, startHistoryId);
  }

  /**
   * Get the current latest historyId for the mailbox
   */
  async getCurrentHistoryId(businessId: number, emailAddress: string): Promise<string> {
    return History.getCurrentHistoryId(this.setCredentials.bind(this), this.gmail, businessId, emailAddress);
  }

  /**
   * Fetch multiple messages by ids and parse into EmailMessage[]
   */
  async getMessagesByIds(
    businessId: number,
    emailAddress: string,
    messageIds: string[]
  ): Promise<EmailMessage[]> {
    return History.getMessagesByIds(
      this.setCredentials.bind(this),
      this.gmail,
      businessId,
      emailAddress,
      messageIds,
      History.parseGmailMessage
    );
  }

  /**
   * Get full Gmail message by ID (returns raw GmailMessage, not parsed EmailMessage)
   */
  async getFullMessage(businessId: number, emailAddress: string, messageId: string): Promise<GmailMessage> {
    await this.setCredentials(businessId, emailAddress);
    const response = await this.gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    return response.data;
  }

  /**
   * Extract HTML and plain text from a Gmail message
   */
  extractHtmlAndPlainText(message: GmailMessage): { html: string; plainText: string } {
    return Actions.extractHtmlAndPlainText(message);
  }

  /**
   * Create a draft email with modified HTML and plain text content
   */
  async createDraftWithContent(options: DraftContentOptions): Promise<string> {
    return Actions.createDraftWithContent(
      this.setCredentials.bind(this),
      this.gmail,
      options
    );
  }

  /**
   * Set up Gmail mailbox watch for push notifications
   */
  async watchMailbox(businessId: number, emailAddress: string): Promise<{ historyId: string; expiration: Date }> {
    return Watch.watchMailbox(this.setCredentials.bind(this), this.gmail, businessId, emailAddress);
  }

  /**
   * Stop watching a Gmail mailbox
   */
  async stopWatch(businessId: number, emailAddress: string): Promise<void> {
    return Watch.stopWatch(this.setCredentials.bind(this), this.gmail, businessId, emailAddress);
  }

  /**
   * Generate secure nonce for OAuth state
   */
  private generateNonce(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
}

// Export singleton instance
export const gmailOAuthService = new GmailOAuthService();
