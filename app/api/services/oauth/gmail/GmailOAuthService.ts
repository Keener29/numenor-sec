/**
 * Gmail OAuth Service
 * Handles Gmail OAuth 2.0 integration with proper error handling and security
 */

import { google } from 'googleapis';
import { query } from '../../../../db/connection.js';
import { oauthLogger } from '../../logger.js';
import { ErrorFactory, ErrorCodes } from '../../errorHandler.js';
import { OAuthProvider } from '../base/OAuthProvider.js';
import type {
  OAuthTokens,
  OAuthState,
  OAuthConnectionStatus,
  EmailMessage,
  LogContext
} from '../base/types.js';
import type {
  GmailMessage,
  GmailMessagePayload,
  GmailHeader,
  GmailBody
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
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/oauth/gmail/callback';

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
    const context: LogContext = {
      operation: 'generate-auth-url',
      businessId,
      emailAddress
    };

    try {
      const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify'
      ];

      const state: OAuthState = {
        businessId,
        emailAddress,
        nonce: this.generateNonce(),
        timestamp: Date.now(),
        provider: 'gmail'
      };

      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: JSON.stringify(state),
        prompt: 'consent' // Force consent screen to get refresh token
      });

      oauthLogger.info('Gmail OAuth authorization URL generated', {
        ...context,
        metadata: {
          scopes,
          nonce: state.nonce
        }
      });

      return authUrl;
    } catch (error) {
      oauthLogger.error('Failed to generate Gmail OAuth authorization URL', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.OAUTH_AUTHORIZATION_FAILED,
        'Failed to generate authorization URL'
      );
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const context: LogContext = {
      operation: 'exchange-code-for-tokens'
    };

    try {
      oauthLogger.info('Exchanging authorization code for Gmail tokens', context);

      const { tokens } = await this.oauth2Client.getToken(code);
      
      const oauthTokens: OAuthTokens = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        scope: tokens.scope,
        tokenType: tokens.token_type,
        expiryDate: new Date(tokens.expiry_date)
      };

      oauthLogger.info('Successfully exchanged code for Gmail tokens', {
        ...context,
        metadata: {
          tokenType: oauthTokens.tokenType,
          scope: oauthTokens.scope,
          expiresAt: oauthTokens.expiryDate.toISOString()
        }
      });

      return oauthTokens;
    } catch (error) {
      oauthLogger.error('Failed to exchange code for Gmail tokens', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.OAUTH_TOKEN_EXCHANGE_FAILED,
        'Failed to exchange authorization code for tokens'
      );
    }
  }

  /**
   * Store OAuth tokens in database
   */
  async storeTokens(
    businessId: number,
    emailAddress: string,
    tokens: OAuthTokens
  ): Promise<void> {
    const context: LogContext = {
      operation: 'store-tokens',
      businessId,
      emailAddress
    };

    try {
      oauthLogger.info('Storing Gmail OAuth tokens in database', context);

      await query(
        `INSERT INTO oauth_tokens (business_id, email_address, provider, access_token, refresh_token, scope, token_type, expiry_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (business_id, email_address, provider)
         DO UPDATE SET
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           scope = EXCLUDED.scope,
           token_type = EXCLUDED.token_type,
           expiry_date = EXCLUDED.expiry_date,
           updated_at = CURRENT_TIMESTAMP`,
        [
          businessId,
          emailAddress,
          'gmail',
          tokens.accessToken,
          tokens.refreshToken,
          tokens.scope,
          tokens.tokenType,
          tokens.expiryDate
        ]
      );

      oauthLogger.info('Gmail OAuth tokens stored successfully', context);
    } catch (error) {
      oauthLogger.error('Failed to store Gmail OAuth tokens', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.DATABASE_QUERY_ERROR,
        'Failed to store OAuth tokens in database'
      );
    }
  }

  /**
   * Get stored OAuth tokens for an email
   */
  async getTokens(businessId: number, emailAddress: string): Promise<OAuthTokens | null> {
    const context: LogContext = {
      operation: 'get-tokens',
      businessId,
      emailAddress
    };

    try {
      const result = await query(
        'SELECT access_token, refresh_token, scope, token_type, expiry_date FROM oauth_tokens WHERE business_id = $1 AND email_address = $2 AND provider = $3',
        [businessId, emailAddress, 'gmail']
      );

      if (result.rows.length === 0) {
        oauthLogger.debug('No Gmail OAuth tokens found', context);
        return null;
      }

      const row = result.rows[0] as {
        access_token: string;
        refresh_token: string;
        scope: string;
        token_type: string;
        expiry_date: Date;
      };
      const tokens: OAuthTokens = {
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        scope: row.scope,
        tokenType: row.token_type,
        expiryDate: row.expiry_date
      };

      oauthLogger.debug('Gmail OAuth tokens retrieved successfully', context);
      return tokens;
    } catch (error) {
      oauthLogger.error('Failed to get Gmail OAuth tokens', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.DATABASE_QUERY_ERROR,
        'Failed to retrieve OAuth tokens from database'
      );
    }
  }

  /**
   * Refresh access token if needed
   */
  async refreshTokenIfNeeded(businessId: number, emailAddress: string): Promise<OAuthTokens> {
    const context: LogContext = {
      operation: 'refresh-token-if-needed',
      businessId,
      emailAddress
    };

    try {
      const tokens = await this.getTokens(businessId, emailAddress);
      
      if (!tokens) {
        throw ErrorFactory.oauthService(
          ErrorCodes.OAUTH_TOKEN_REFRESH_FAILED,
          'No Gmail OAuth tokens found for this email'
        );
      }

      // Check if token is expired (with 5 minute buffer)
      const now = Date.now();
      const expiryBuffer = 5 * 60 * 1000; // 5 minutes

      if (tokens.expiryDate.getTime() - now < expiryBuffer) {
        oauthLogger.info('Refreshing expired Gmail OAuth token', context);
        
        this.oauth2Client.setCredentials({
          refresh_token: tokens.refreshToken
        });

        const { credentials } = await this.oauth2Client.refreshAccessToken();
        const newTokens: OAuthTokens = {
          accessToken: credentials.access_token,
          refreshToken: credentials.refresh_token || tokens.refreshToken,
          scope: credentials.scope || tokens.scope,
          tokenType: credentials.token_type || tokens.tokenType,
          expiryDate: new Date(credentials.expiry_date)
        };

        // Update stored tokens
        await this.storeTokens(businessId, emailAddress, newTokens);
        
        oauthLogger.info('Gmail OAuth token refreshed successfully', context);
        return newTokens;
      }

      return tokens;
    } catch (error) {
      oauthLogger.error('Failed to refresh Gmail OAuth token', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.OAUTH_TOKEN_REFRESH_FAILED,
        'Failed to refresh OAuth token'
      );
    }
  }

  /**
   * Set OAuth credentials for API calls
   */
  async setCredentials(businessId: number, emailAddress: string): Promise<void> {
    const context: LogContext = {
      operation: 'set-credentials',
      businessId,
      emailAddress
    };

    try {
      const tokens = await this.refreshTokenIfNeeded(businessId, emailAddress);
      
      this.oauth2Client.setCredentials({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken
      });

      oauthLogger.debug('Gmail OAuth credentials set successfully', context);
    } catch (error) {
      oauthLogger.error('Failed to set Gmail OAuth credentials', context, error as Error);
      throw error;
    }
  }

  /**
   * Fetch emails from Gmail
   */
  async fetchEmails(
    businessId: number,
    emailAddress: string,
    maxResults: number = 10,
    query: string = 'is:unread',
    connectionTimestamp?: Date
  ): Promise<EmailMessage[]> {
    const context: LogContext = {
      operation: 'fetch-emails',
      businessId,
      emailAddress,
      metadata: {
        maxResults,
        query
      }
    };

    try {
      await this.setCredentials(businessId, emailAddress);

      // Build Gmail query to only fetch emails after connection time
      let gmailQuery = query;
      if (connectionTimestamp) {
        // Convert connection timestamp to Gmail date format (YYYY/MM/DD)
        const connectionDate = connectionTimestamp.toISOString().split('T')[0].replace(/-/g, '/');
        gmailQuery = `${query} after:${connectionDate}`;
        
        oauthLogger.debug('Fetching emails from Gmail after connection time', {
          ...context,
          metadata: {
            ...context.metadata,
            connectionTimestamp: connectionTimestamp.toISOString(),
            gmailQuery
          }
        });
      } else {
        oauthLogger.debug('Fetching emails from Gmail', context);
      }

      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: gmailQuery
      });

      const messages = response.data.messages || [];
      
      if (messages.length === 0) {
        oauthLogger.debug('No emails found', context);
        return [];
      }

      // Fetch full message details
      const messagePromises = messages.map((message: { id: string }) =>
        this.gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        })
      );

      const messageResponses = await Promise.all(messagePromises);
      const gmailMessages = messageResponses.map(response => response.data);

      // Convert Gmail messages to standard EmailMessage format
      const emailMessages = gmailMessages.map(gmailMessage => 
        this.parseGmailMessage(gmailMessage, emailAddress)
      );

      oauthLogger.info('Successfully fetched emails from Gmail', {
        ...context,
        metadata: {
          ...context.metadata,
          emailCount: emailMessages.length
        }
      });

      return emailMessages;

    } catch (error) {
      oauthLogger.error('Failed to fetch emails from Gmail', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.GMAIL_API_ERROR,
        'Failed to fetch emails from Gmail API'
      );
    }
  }

  /**
   * Mark email as read
   */
  async markAsRead(businessId: number, emailAddress: string, messageId: string): Promise<void> {
    const context: LogContext = {
      operation: 'mark-as-read',
      businessId,
      emailAddress,
      metadata: { messageId }
    };

    try {
      await this.setCredentials(businessId, emailAddress);

      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        resource: {
          removeLabelIds: ['UNREAD']
        }
      });

      oauthLogger.debug('Email marked as read successfully', context);
    } catch (error) {
      oauthLogger.error('Failed to mark email as read', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.GMAIL_API_ERROR,
        'Failed to mark email as read'
      );
    }
  }

  /**
   * Delete an email message
   */
  async deleteEmail(businessId: number, emailAddress: string, messageId: string): Promise<void> {
    const context: LogContext = {
      operation: 'delete-email',
      businessId,
      emailAddress,
      metadata: { messageId }
    };

    try {
      const tokens = await this.refreshTokenIfNeeded(businessId, emailAddress);
      this.oauth2Client.setCredentials(tokens);

      await this.gmail.users.messages.delete({
        userId: 'me',
        id: messageId
      });

      oauthLogger.info('Email deleted successfully', context);
    } catch (error) {
      oauthLogger.error('Failed to delete email', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.GMAIL_API_ERROR,
        'Failed to delete email'
      );
    }
  }

  /**
   * Move an email to trash (soft delete)
   */
  async moveToTrash(businessId: number, emailAddress: string, messageId: string): Promise<void> {
    const context: LogContext = {
      operation: 'move-to-trash',
      businessId,
      emailAddress,
      metadata: { messageId }
    };

    try {
      const tokens = await this.refreshTokenIfNeeded(businessId, emailAddress);
      this.oauth2Client.setCredentials(tokens);

      await this.gmail.users.messages.trash({
        userId: 'me',
        id: messageId
      });

      oauthLogger.info('Email moved to trash successfully', context);
    } catch (error) {
      oauthLogger.error('Failed to move email to trash', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.GMAIL_API_ERROR,
        'Failed to move email to trash'
      );
    }
  }

  /**
   * Get OAuth connection status
   */
  async getConnectionStatus(businessId: number, emailAddress: string): Promise<OAuthConnectionStatus> {
    const context: LogContext = {
      operation: 'get-connection-status',
      businessId,
      emailAddress
    };

    try {
      const tokenResult = await query(
        'SELECT created_at, updated_at, expiry_date FROM oauth_tokens WHERE business_id = $1 AND email_address = $2 AND provider = $3',
        [businessId, emailAddress, 'gmail']
      );

      const emailResult = await query(
        'SELECT id FROM monitored_emails WHERE business_id = $1 AND email_address = $2',
        [businessId, emailAddress]
      );

      const isConnected = tokenResult.rows.length > 0 && emailResult.rows.length > 0;
      const connectedAt = tokenResult.rows.length > 0 ? (tokenResult.rows[0] as { created_at: Date }).created_at : null;
      const tokenExpiry = tokenResult.rows.length > 0 ? (tokenResult.rows[0] as { expiry_date: Date }).expiry_date : undefined;

      oauthLogger.debug('Gmail OAuth connection status retrieved', {
        ...context,
        metadata: {
          isConnected,
          connectedAt,
          tokenExpiry
        }
      });

      return {
        isConnected,
        connectedAt,
        provider: 'gmail',
        tokenExpiry
      };
    } catch (error) {
      oauthLogger.error('Failed to get Gmail OAuth connection status', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.DATABASE_QUERY_ERROR,
        'Failed to get OAuth connection status'
      );
    }
  }

  /**
   * Disconnect OAuth for an email
   */
  async disconnect(businessId: number, emailAddress: string): Promise<void> {
    const context: LogContext = {
      operation: 'disconnect-oauth',
      businessId,
      emailAddress
    };

    try {
      await query(
        'DELETE FROM oauth_tokens WHERE business_id = $1 AND email_address = $2 AND provider = $3',
        [businessId, emailAddress, 'gmail']
      );

      oauthLogger.info('Gmail OAuth disconnected successfully', context);
    } catch (error) {
      oauthLogger.error('Failed to disconnect Gmail OAuth', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.DATABASE_QUERY_ERROR,
        'Failed to disconnect OAuth'
      );
    }
  }

  /**
   * Validate OAuth state parameter
   */
  validateState(state: string): OAuthState {
    try {
      const stateData = JSON.parse(state);
      
      if (!stateData.businessId || !stateData.emailAddress || !stateData.nonce || !stateData.timestamp) {
        throw new Error('Invalid state structure');
      }

      // Check if state is not older than 10 minutes
      const stateAge = Date.now() - stateData.timestamp;
      if (stateAge > 10 * 60 * 1000) {
        throw new Error('State parameter expired');
      }

      return stateData as OAuthState;
    } catch (error) {
      throw ErrorFactory.oauthService(
        ErrorCodes.OAUTH_STATE_VALIDATION_FAILED,
        'Invalid or expired OAuth state parameter'
      );
    }
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
    try {
      // Get the OAuth connection timestamp to only test with emails after connection
      const tokenResult = await query(
        'SELECT created_at FROM oauth_tokens WHERE business_id = $1 AND email_address = $2 AND provider = $3',
        [businessId, emailAddress, 'gmail']
      );
      
      const connectionTimestamp = tokenResult.rows.length > 0 
        ? (tokenResult.rows[0] as { created_at: Date }).created_at 
        : undefined;

      // Test the connection by fetching a few emails (only after connection time)
      const emails = await this.fetchEmails(businessId, emailAddress, 5, 'is:unread', connectionTimestamp);
      
      return {
        success: true,
        message: 'Gmail connection test successful',
        emailCount: emails.length,
        emails: emails.map(email => ({
          id: email.id,
          subject: email.subject,
          sender: email.sender
        }))
      };
    } catch (error) {
      return {
        success: false,
        message: 'Gmail connection test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Parse Gmail message to extract content
   */
  parseGmailMessage(message: GmailMessage, emailAddress?: string): EmailMessage {
    const headers = message.payload.headers.reduce((acc, header) => {
      acc[header.name.toLowerCase()] = header.value;
      return acc;
    }, {} as Record<string, string>);

    // Extract body content
    let body = '';
    if (message.payload.body.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    } else if (message.payload.parts) {
      // Handle multipart messages
      for (const part of message.payload.parts) {
        if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
          if (part.body.data) {
            body += Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
        }
      }
    }

    // Extract links from body
    const linkRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
    const links = body.match(linkRegex) || [];

    return {
      id: message.id,
      subject: headers.subject || 'No Subject',
      body: body || message.snippet,
      sender: headers.from || 'Unknown Sender',
      recipient: headers.to || emailAddress || 'Unknown Recipient',
      timestamp: new Date(parseInt(message.internalDate)),
      links,
      headers
    };
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
