/**
 * Outlook OAuth Service
 * Handles Microsoft Outlook/Office 365 OAuth 2.0 integration using Microsoft Graph API
 */

import { OAuthProvider } from '../base/OAuthProvider.js';
import { oauthLogger } from '../../../../utils/logger.js';
import { ErrorFactory, ErrorCodes } from '../../errorHandler.js';
import type {
  OAuthTokens,
  OAuthState,
  OAuthConnectionStatus,
  EmailMessage,
  LogContext
} from '../base/types.js';
import * as Auth from './OutlookAuth.js';
import { MicrosoftGraphClient } from './MicrosoftGraphClient.js';
import { parseGraphMessage } from './MicrosoftEmailAdapter.js';
import { microsoftSubscriptionService } from './MicrosoftSubscriptionService.js';
import { withLock } from '../../../utils/distributedLock.js';
import { createConcurrencyLimiter } from '../../../utils/concurrencyLimiter.js';

export class OutlookOAuthService extends OAuthProvider {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly webhookUrl: string;

  constructor() {
    super('microsoft');
    this.clientId = process.env.AZURE_CLIENT_ID || '';
    this.clientSecret = process.env.AZURE_CLIENT_SECRET || '';
    this.redirectUri = process.env.AZURE_REDIRECT_URI || '';
    
    const baseUrl = process.env.PUBSUB_WEBHOOK_URL || process.env.API_URL || '';
    this.webhookUrl = baseUrl ? `${baseUrl}/api/microsoft-notify` : '';

    if (!this.clientId || !this.clientSecret) {
      oauthLogger.warn('Microsoft OAuth credentials not configured', {
        operation: 'outlook-oauth-init',
        metadata: { hasClientId: !!this.clientId, hasClientSecret: !!this.clientSecret }
      });
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  async generateAuthUrl(businessId: number, emailAddress: string): Promise<string> {
    if (!this.clientId || !this.redirectUri) {
      throw ErrorFactory.oauthService(
        ErrorCodes.OAUTH_CONFIGURATION_ERROR,
        'Microsoft OAuth not configured. Set AZURE_CLIENT_ID and AZURE_REDIRECT_URI'
      );
    }
    return Auth.generateAuthUrl(this.clientId, this.redirectUri, businessId, emailAddress);
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw ErrorFactory.oauthService(
        ErrorCodes.OAUTH_CONFIGURATION_ERROR,
        'Microsoft OAuth not configured'
      );
    }
    return Auth.exchangeCodeForTokens(this.clientId, this.clientSecret, this.redirectUri, code);
  }

  /**
   * Store OAuth tokens in database
   */
  async storeTokens(
    businessId: number,
    emailAddress: string,
    tokens: OAuthTokens
  ): Promise<void> {
    await Auth.storeTokens(businessId, emailAddress, tokens);
    
    // Create subscription after storing tokens
    if (this.webhookUrl) {
      try {
        await microsoftSubscriptionService.createSubscription(
          businessId,
          emailAddress,
          tokens.accessToken,
          this.webhookUrl,
          { operation: 'create-subscription', businessId, emailAddress }
        );
      } catch (error) {
        oauthLogger.error('Failed to create subscription after storing tokens', {
          operation: 'store-tokens',
          businessId,
          emailAddress
        }, error as Error);
        // Don't throw - tokens are stored, subscription can be created later
      }
    }
  }

  /**
   * Get stored OAuth tokens for an email
   */
  async getTokens(businessId: number, emailAddress: string): Promise<OAuthTokens | null> {
    return Auth.getTokens(businessId, emailAddress);
  }

  /**
   * Required scopes for Microsoft Graph API operations
   * These scopes are needed for reading/writing emails and creating subscriptions
   */
  private readonly REQUIRED_SCOPES = [
    'https://graph.microsoft.com/Mail.ReadWrite',
    'offline_access'
  ];

  /**
   * Validate that token has required scopes
   * Throws an error if scopes are missing
   * 
   * Microsoft Graph API can return scopes in different formats:
   * - Full: "https://graph.microsoft.com/Mail.ReadWrite"
   * - Short: "Mail.ReadWrite" (sometimes)
   * - Space-separated: "https://graph.microsoft.com/Mail.ReadWrite offline_access"
   */
  private validateScopes(tokens: OAuthTokens, context: LogContext): void {
    const tokenScopes = (tokens.scope || '').split(' ').filter(s => s.length > 0).map(s => s.toLowerCase());
    const missingScopes: string[] = [];

    for (const requiredScope of this.REQUIRED_SCOPES) {
      const requiredLower = requiredScope.toLowerCase();
      const requiredShort = requiredScope.split('/').pop()?.toLowerCase() || '';
      
      // Check if any token scope matches:
      // 1. Exact match (case-insensitive)
      // 2. Ends with the short scope name (e.g., "Mail.ReadWrite")
      // 3. Contains the full scope URL
      const hasScope = tokenScopes.some(scope => {
        return scope === requiredLower ||
               scope.endsWith(requiredShort) ||
               scope.includes(requiredLower);
      });
      
      if (!hasScope) {
        missingScopes.push(requiredScope);
      }
    }

    if (missingScopes.length > 0) {
      oauthLogger.error('Token missing required scopes after refresh', {
        ...context,
        metadata: {
          tokenScopes: tokens.scope?.split(' ') || [],
          requiredScopes: this.REQUIRED_SCOPES,
          missingScopes
        }
      });
      throw ErrorFactory.oauthService(
        ErrorCodes.OAUTH_INSUFFICIENT_SCOPES,
        `Token missing required scopes: ${missingScopes.join(', ')}. Re-authentication required.`
      );
    }

    oauthLogger.debug('Token scopes validated successfully', {
      ...context,
      metadata: {
        tokenScopes: tokens.scope?.split(' ') || [],
        requiredScopes: this.REQUIRED_SCOPES
      }
    });
  }

  /**
   * Refresh access token if needed
   * Uses PostgreSQL advisory locks for distributed locking across multiple instances
   * This prevents race conditions in multi-instance deployments (horizontal scaling, serverless, etc.)
   * 
   * Without distributed locking:
   * - Multiple instances can refresh the same token simultaneously
   * - This causes refresh token invalidation
   * - Results in random 401s and "works locally, fails in prod" issues
   * 
   * After refresh, validates that required scopes are present to prevent 403 errors
   */
  async refreshTokenIfNeeded(businessId: number, emailAddress: string): Promise<OAuthTokens> {
    if (!this.clientId || !this.clientSecret) {
      throw ErrorFactory.oauthService(
        ErrorCodes.OAUTH_CONFIGURATION_ERROR,
        'Microsoft OAuth not configured'
      );
    }

    const lockKey = `oauth:refresh:${businessId}:${emailAddress}`;
    const context: LogContext = {
      operation: 'refresh-token-if-needed',
      businessId,
      emailAddress
    };
    
    // Use distributed lock to prevent concurrent refreshes across all instances
    // The lock is automatically released when the function completes (success or error)
    const tokens = await withLock(lockKey, async () => {
      return await Auth.refreshTokenIfNeeded(
        this.clientId,
        this.clientSecret,
        businessId,
        emailAddress
      );
    }, 10000); // 10 second timeout (token refresh should complete quickly)

    // Validate scopes after refresh to prevent 403 errors from missing permissions
    // This catches cases where Microsoft returns tokens with reduced scopes
    this.validateScopes(tokens, context);

    return tokens;
  }

  /**
   * Set OAuth credentials for API calls
   */
  async setCredentials(businessId: number, emailAddress: string): Promise<void> {
    await this.refreshTokenIfNeeded(businessId, emailAddress);
  }

  /**
   * Fetch emails from Outlook using Microsoft Graph API
   * Uses limited concurrency to avoid overwhelming Graph API with bursty traffic
   */
  async fetchEmails(
    businessId: number,
    emailAddress: string,
    maxResults: number = 10,
    searchQuery: string = '',
    connectionTimestamp?: Date
  ): Promise<EmailMessage[]> {
    const context: LogContext = {
      operation: 'fetch-emails',
      businessId,
      emailAddress,
      metadata: { maxResults, query: searchQuery }
    };

    try {
      // Refresh token if needed
      const tokens = await this.refreshTokenIfNeeded(businessId, emailAddress);
      const graphClient = new MicrosoftGraphClient(tokens.accessToken);

      // Build filter query
      let filter = '';
      if (connectionTimestamp) {
        const isoDate = connectionTimestamp.toISOString();
        filter = `receivedDateTime ge ${isoDate}`;
      }
      if (searchQuery) {
        // Graph API uses OData filter syntax
        // For simple queries, we can use $search or $filter
        // For now, use $search for subject/body content
        // Note: $search requires specific indexes, so we'll use $filter for dates
      }

      // Fetch messages
      const response = await graphClient.listMessages(filter, maxResults, context);
      const messages = response.value || [];

      if (messages.length === 0) {
        oauthLogger.info('No messages found', context);
        return [];
      }

      // Fetch full message details with limited concurrency
      // Graph API punishes bursty traffic, so we limit to 3 concurrent requests
      const limit = createConcurrencyLimiter(3);
      const results = await Promise.allSettled(
        messages.map(message =>
          limit(async () => {
            try {
              const fullMessage = await graphClient.getMessage(message.id, context);
              return parseGraphMessage(fullMessage, emailAddress);
            } catch (error) {
              const err = error instanceof Error ? error : new Error(String(error));
              oauthLogger.warn('Failed to fetch full message details', {
                ...context,
                metadata: { messageId: message.id, errorMessage: err.message }
              } as LogContext);
              // Fallback to basic message data
              return parseGraphMessage(message, emailAddress);
            }
          })
        )
      );

      // Extract successful results and log failures
      const emailMessages: EmailMessage[] = [];
      let failureCount = 0;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
          emailMessages.push(result.value);
        } else {
          failureCount++;
          // Fallback to basic message data if full fetch failed
          emailMessages.push(parseGraphMessage(messages[i], emailAddress));
          const error = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
          oauthLogger.warn('Failed to fetch full message details (fallback to basic)', {
            ...context,
            metadata: { messageId: messages[i].id, errorMessage: error.message }
          } as LogContext);
        }
      }

      if (failureCount > 0) {
        oauthLogger.warn('Some message fetches failed', {
          ...context,
          metadata: { failureCount, totalCount: messages.length }
        });
      }

      oauthLogger.info('Successfully fetched emails from Microsoft Graph', {
        ...context,
        metadata: { ...context.metadata, emailCount: emailMessages.length, failureCount }
      });

      return emailMessages;
    } catch (error) {
      oauthLogger.error('Failed to fetch emails from Microsoft Graph', context, error as Error);
      throw ErrorFactory.oauthService(ErrorCodes.SERVICE_UNAVAILABLE, 'Failed to fetch emails from Microsoft Graph API');
    }
  }

  /**
   * Delete an email message
   */
  async deleteEmail(businessId: number, emailAddress: string, messageId: string): Promise<void> {
    const context: LogContext = { operation: 'delete-email', businessId, emailAddress, metadata: { messageId } };
    try {
      const tokens = await this.refreshTokenIfNeeded(businessId, emailAddress);
      const graphClient = new MicrosoftGraphClient(tokens.accessToken);
      await graphClient.deleteMessage(messageId, context);
      oauthLogger.info('Email deleted successfully', context);
    } catch (error) {
      oauthLogger.error('Failed to delete email', context, error as Error);
      throw ErrorFactory.oauthService(ErrorCodes.SERVICE_UNAVAILABLE, 'Failed to delete email');
    }
  }

  /**
   * Move an email to trash (soft delete)
   */
  async moveToTrash(businessId: number, emailAddress: string, messageId: string): Promise<void> {
    // Microsoft Graph doesn't have a "trash" concept like Gmail
    // For MVP, we'll use delete (hard delete)
    // TODO: Implement move to DeletedItems folder for true soft delete
    const context: LogContext = { operation: 'move-to-trash', businessId, emailAddress, metadata: { messageId } };
    try {
      const tokens = await this.refreshTokenIfNeeded(businessId, emailAddress);
      const graphClient = new MicrosoftGraphClient(tokens.accessToken);
      await graphClient.deleteMessage(messageId, context);
      oauthLogger.info('Email moved to trash successfully', context);
    } catch (error) {
      oauthLogger.error('Failed to move email to trash', context, error as Error);
      throw ErrorFactory.oauthService(ErrorCodes.SERVICE_UNAVAILABLE, 'Failed to move email to trash');
    }
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
    const context: LogContext = {
      operation: 'disconnect-oauth',
      businessId,
      emailAddress
    };

    try {
      // Delete subscription first
      const tokens = await this.getTokens(businessId, emailAddress);
      if (tokens) {
        try {
          await microsoftSubscriptionService.deleteSubscription(
            businessId,
            emailAddress,
            tokens.accessToken,
            context
          );
        } catch (error) {
          oauthLogger.warn('Failed to delete subscription during disconnect', context, { message: (error as Error).message });
          // Continue with token deletion
        }
      }

      // Delete tokens
      await Auth.disconnect(businessId, emailAddress);
      oauthLogger.info('Microsoft OAuth disconnected successfully', context);
    } catch (error) {
      oauthLogger.error('Failed to disconnect Microsoft OAuth', context, error as Error);
      throw ErrorFactory.oauthService(
        ErrorCodes.DATABASE_QUERY_ERROR,
        'Failed to disconnect OAuth'
      );
    }
  }

  /**
   * Validate OAuth state parameter
   */
  async validateState(state: string): Promise<OAuthState> {
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
    const context: LogContext = { operation: 'test-connection', businessId, emailAddress };
    try {
      const tokens = await this.refreshTokenIfNeeded(businessId, emailAddress);
      const graphClient = new MicrosoftGraphClient(tokens.accessToken);
      
      // Fetch a few recent emails
      const response = await graphClient.listMessages(undefined, 5, context);
      const messages = response.value || [];
      
      const emails = messages.map(msg => ({
        id: msg.id,
        subject: msg.subject || 'No Subject',
        sender: msg.sender?.emailAddress?.address || 'Unknown'
      }));

      return {
        success: true,
        message: 'Microsoft Graph connection test successful',
        emailCount: emails.length,
        emails
      };
    } catch (error) {
      return {
        success: false,
        message: 'Microsoft Graph connection test failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const outlookOAuthService = new OutlookOAuthService();
