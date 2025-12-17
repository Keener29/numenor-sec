/**
 * Microsoft Graph API Client
 * Wrapper for Microsoft Graph API calls with OAuth token management
 */

import { oauthLogger } from '../../../../utils/logger.js';
import { ErrorFactory, ErrorCodes } from '../../errorHandler.js';
import type { LogContext } from '../base/types.js';
import type { GraphSubscription, GraphMessage } from './types.js';

// Re-export types for backward compatibility
export type { GraphSubscription, GraphMessage };

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

export class MicrosoftGraphClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async handleBadResponse(response: Response, method: string, endpoint: string, context?: LogContext): Promise<void> {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
    
    // Handle rate limiting with typed, retryable error
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
      
      oauthLogger.warn('Microsoft Graph API rate limited', {
        ...context,
        operation: 'graph-api-rate-limit',
        metadata: { endpoint, retryAfterSeconds }
      });
      
      throw ErrorFactory.oauthService(
        ErrorCodes.RATE_LIMIT_EXCEEDED,
        'Microsoft Graph API rate limit exceeded',
        429,
        { retryAfter: retryAfterSeconds }
      );
    }

    oauthLogger.error(`Graph API request failed: ${method} ${endpoint}`, context || { operation: 'graph-api-request' }, new Error(errorMessage));
    throw ErrorFactory.oauthService(
      ErrorCodes.INTERNAL_SERVER_ERROR,
      `Microsoft Graph API error: ${errorMessage}`
    );
  }

  /**
   * Make authenticated request to Microsoft Graph API
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    context?: LogContext
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${GRAPH_API_BASE}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          ...(body ? {} : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (!response.ok) {
        this.handleBadResponse(response, method, endpoint, context);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return await response.json();
    } catch (error) {
      // Re-throw typed rate limit errors (they're already properly formatted)
      if (error instanceof Error && 'code' in error && (error as any).code === ErrorCodes.RATE_LIMIT_EXCEEDED) {
        throw error;
      }
      
      // Preserve original error as cause
      const originalError = error instanceof Error ? error : new Error(String(error));
      oauthLogger.error(`Graph API request error: ${method} ${endpoint}`, context || { operation: 'graph-api-request' }, originalError);
      
      const apiError = ErrorFactory.oauthService(
        ErrorCodes.INTERNAL_SERVER_ERROR,
        'Failed to communicate with Microsoft Graph API',
        500,
        {
          originalError: {
            message: originalError.message,
            name: originalError.name,
            stack: originalError.stack
          }
        }
      );
      
      // Set cause property (Node.js 16.9+)
      if ('cause' in apiError) {
        (apiError as any).cause = originalError;
      }
      
      throw apiError;
    }
  }

  /**
   * Create a subscription for change notifications
   */
  async createSubscription(
    resource: string,
    notificationUrl: string,
    expirationDateTime: string,
    clientState?: string,
    context?: LogContext
  ): Promise<GraphSubscription> {
    const body: any = {
      changeType: 'created',
      notificationUrl,
      resource,
      expirationDateTime,
    };

    if (clientState) {
      body.clientState = clientState;
    }

    return this.request<GraphSubscription>('POST', '/subscriptions', body, context);
  }

  /**
   * Renew a subscription
   */
  async renewSubscription(
    subscriptionId: string,
    expirationDateTime: string,
    context?: LogContext
  ): Promise<GraphSubscription> {
    return this.request<GraphSubscription>(
      'PATCH',
      `/subscriptions/${subscriptionId}`,
      { expirationDateTime },
      context
    );
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(subscriptionId: string, context?: LogContext): Promise<void> {
    await this.request('DELETE', `/subscriptions/${subscriptionId}`, undefined, context);
  }

  /**
   * List subscriptions
   */
  async listSubscriptions(context?: LogContext): Promise<{ value: GraphSubscription[] }> {
    return this.request<{ value: GraphSubscription[] }>('GET', '/subscriptions', undefined, context);
  }

  /**
   * Get a message by ID
   * Uses $select to fetch required fields
   */
  async getMessage(messageId: string, context?: LogContext): Promise<GraphMessage> {
    // Select all fields needed for email parsing and phishing detection
    const selectFields = [
      'id',
      'subject',
      'bodyPreview',
      'body',
      'from',
      'sender',
      'toRecipients',
      'internetMessageHeaders',
      'attachments',
      'receivedDateTime'
    ].join(',');
    
    return this.request<GraphMessage>(
      'GET',
      `/me/messages/${messageId}?$select=${selectFields}`,
      undefined,
      context
    );
  }

  /**
   * List messages (for fallback polling)
   * Only selects minimal fields since full details are fetched via getMessage()
   * Returns pagination link if more results are available
   */
  async listMessages(
    filter?: string,
    top?: number,
    context?: LogContext
  ): Promise<{ value: GraphMessage[]; '@odata.nextLink'?: string }> {
    let url = '/me/messages';
    const params = new URLSearchParams();
    
    // Select only id and subject (id is required, subject for logging/fallback)
    // Full details are fetched via getMessage() for each message
    params.append('$select', 'id,subject,receivedDateTime');
    params.append('$orderby', 'receivedDateTime desc');
    
    if (filter) {
      params.append('$filter', filter);
    }
    if (top) {
      params.append('$top', top.toString());
    }
    
    url += `?${params.toString()}`;

    return this.request<{ value: GraphMessage[]; '@odata.nextLink'?: string }>('GET', url, undefined, context);
  }

  /**
   * List all messages with automatic pagination
   * Follows @odata.nextLink until all pages are fetched
   * Use with caution for large inboxes - consider using listMessages with pagination instead
   */
  async listAllMessages(
    filter?: string,
    top?: number,
    context?: LogContext
  ): Promise<GraphMessage[]> {
    const allMessages: GraphMessage[] = [];
    let nextLink: string | undefined;
    let pageCount = 0;
    const MAX_PAGES = 100; // Safety limit to prevent infinite loops

    do {
      let url: string;
      if (nextLink) {
        // Use nextLink directly (it's a full URL)
        url = nextLink;
      } else {
        // First page - build URL with params
        url = '/me/messages';
        const params = new URLSearchParams();
        params.append('$select', 'id,subject,receivedDateTime');
        params.append('$orderby', 'receivedDateTime desc');
        
        if (filter) {
          params.append('$filter', filter);
        }
        if (top) {
          params.append('$top', top.toString());
        }
        
        url += `?${params.toString()}`;
      }

      const response = await this.request<{ value: GraphMessage[]; '@odata.nextLink'?: string }>(
        'GET',
        url,
        undefined,
        context
      );

      allMessages.push(...(response.value || []));
      nextLink = response['@odata.nextLink'];
      pageCount++;

      // Safety check to prevent infinite loops
      if (pageCount >= MAX_PAGES) {
        oauthLogger.warn('Reached maximum page limit in listAllMessages', {
          ...context,
          operation: 'list-all-messages',
          metadata: { pageCount: MAX_PAGES, messageCount: allMessages.length }
        });
        break;
      }
    } while (nextLink);

    return allMessages;
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string, context?: LogContext): Promise<void> {
    await this.request('DELETE', `/me/messages/${messageId}`, undefined, context);
  }
}

