/**
 * Outlook OAuth Authentication Helpers
 * Handles OAuth token management for Microsoft Graph
 */

import { query } from '../../../../db/connection.js';
import { oauthLogger } from '../../../../utils/logger.js';
import { ErrorFactory, ErrorCodes } from '../../errorHandler.js';
import type { OAuthTokens, OAuthState, OAuthConnectionStatus, LogContext } from '../base/types.js';
import { validateOAuthState, generateNonce } from '../base/stateValidation.js';

const GRAPH_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

export async function generateAuthUrl(
  clientId: string,
  redirectUri: string,
  businessId: number,
  emailAddress: string
): Promise<string> {
  const context: LogContext = {
    operation: 'generate-auth-url',
    businessId,
    emailAddress
  };

  try {
    const scopes = [
      'https://graph.microsoft.com/Mail.ReadWrite',
      'offline_access'
    ].join(' ');

    const nonce = generateNonce();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5); // 5 minute expiry

    // Store nonce in database for verification
    await query(
      `INSERT INTO oauth_nonces (nonce, business_id, email_address, provider, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [nonce, businessId, emailAddress, 'outlook', expiresAt]
    );

    const state: OAuthState = {
      businessId,
      emailAddress,
      nonce,
      timestamp: Date.now(),
      provider: 'outlook'
    };

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: scopes,
      state: JSON.stringify(state),
      prompt: 'select_account'
    });

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;

    oauthLogger.info('Microsoft OAuth authorization URL generated', {
      ...context,
      metadata: {
        scopes,
        nonce: state.nonce
      }
    });

    return authUrl;
  } catch (error) {
    oauthLogger.error('Failed to generate Microsoft OAuth authorization URL', context, error as Error);
    throw ErrorFactory.oauthService(
      ErrorCodes.OAUTH_AUTHORIZATION_FAILED,
      'Failed to generate authorization URL'
    );
  }
}

export async function exchangeCodeForTokens(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string
): Promise<OAuthTokens> {
  const context: LogContext = { operation: 'exchange-code-for-tokens' };
  try {
    oauthLogger.info('Exchanging authorization code for Microsoft tokens', context);
    
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const response = await fetch(GRAPH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error_description || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Calculate expiry date (expires_in is in seconds)
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + (data.expires_in || 3600));

    const oauthTokens: OAuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      scope: data.scope || 'Mail.ReadWrite offline_access',
      tokenType: data.token_type || 'Bearer',
      expiryDate
    };

    oauthLogger.info('Successfully exchanged code for Microsoft tokens', {
      ...context,
      metadata: {
        tokenType: oauthTokens.tokenType,
        scope: oauthTokens.scope,
        expiresAt: oauthTokens.expiryDate.toISOString()
      }
    });

    return oauthTokens;
  } catch (error) {
    oauthLogger.error('Failed to exchange code for Microsoft tokens', context, error as Error);
    throw ErrorFactory.oauthService(
      ErrorCodes.OAUTH_TOKEN_EXCHANGE_FAILED,
      'Failed to exchange authorization code for tokens'
    );
  }
}

export async function storeTokens(
  businessId: number,
  emailAddress: string,
  tokens: OAuthTokens
): Promise<void> {
  const context: LogContext = { operation: 'store-tokens', businessId, emailAddress };
  try {
    oauthLogger.info('Storing Microsoft OAuth tokens in database', context);
    await query(
      `INSERT INTO oauth_tokens (business_id, email_address, provider, access_token, refresh_token, scope, token_type, expiry_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (business_id, email_address, provider)
       DO UPDATE SET access_token = EXCLUDED.access_token,
                     refresh_token = EXCLUDED.refresh_token,
                     scope = EXCLUDED.scope,
                     token_type = EXCLUDED.token_type,
                     expiry_date = EXCLUDED.expiry_date,
                     updated_at = CURRENT_TIMESTAMP`,
      [businessId, emailAddress, 'outlook', tokens.accessToken, tokens.refreshToken, tokens.scope, tokens.tokenType, tokens.expiryDate]
    );
    oauthLogger.info('Microsoft OAuth tokens stored successfully', context);
  } catch (error) {
    oauthLogger.error('Failed to store Microsoft OAuth tokens', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.DATABASE_QUERY_ERROR, 'Failed to store OAuth tokens in database');
  }
}

export async function getTokens(businessId: number, emailAddress: string): Promise<OAuthTokens | null> {
  const context: LogContext = { operation: 'get-tokens', businessId, emailAddress };
  try {
    const result = await query(
      'SELECT access_token, refresh_token, scope, token_type, expiry_date FROM oauth_tokens WHERE business_id = $1 AND email_address = $2 AND provider = $3',
      [businessId, emailAddress, 'outlook']
    );
    if (result.rows.length === 0) {
      oauthLogger.debug('No Microsoft OAuth tokens found', context);
      return null;
    }
    const row = result.rows[0] as any;
    const tokens: OAuthTokens = {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      scope: row.scope,
      tokenType: row.token_type,
      expiryDate: row.expiry_date
    };
    oauthLogger.debug('Microsoft OAuth tokens retrieved successfully', context);
    return tokens;
  } catch (error) {
    oauthLogger.error('Failed to get Microsoft OAuth tokens', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.DATABASE_QUERY_ERROR, 'Failed to retrieve OAuth tokens from database');
  }
}

export async function refreshTokenIfNeeded(
  clientId: string,
  clientSecret: string,
  businessId: number,
  emailAddress: string
): Promise<OAuthTokens> {
  const context: LogContext = { operation: 'refresh-token-if-needed', businessId, emailAddress };
  try {
    const tokens = await getTokens(businessId, emailAddress);
    if (!tokens) {
      throw ErrorFactory.oauthService(ErrorCodes.OAUTH_TOKEN_REFRESH_FAILED, 'No Microsoft OAuth tokens found for this email');
    }
    const now = Date.now();
    const expiryBuffer = 5 * 60 * 1000; // 5 minutes buffer
    if (tokens.expiryDate.getTime() - now < expiryBuffer) {
      oauthLogger.info('Refreshing expired Microsoft OAuth token', context);
      
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token'
      });

      const response = await fetch(GRAPH_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error_description || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + (data.expires_in || 3600));

      const newTokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || tokens.refreshToken, // Keep old refresh token if not provided
        scope: data.scope || tokens.scope,
        tokenType: data.token_type || tokens.tokenType,
        expiryDate
      };
      
      await storeTokens(businessId, emailAddress, newTokens);
      oauthLogger.info('Microsoft OAuth token refreshed successfully', context);
      return newTokens;
    }
    return tokens;
  } catch (error) {
    oauthLogger.error('Failed to refresh Microsoft OAuth token', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.OAUTH_TOKEN_REFRESH_FAILED, 'Failed to refresh OAuth token');
  }
}

export async function getConnectionStatus(businessId: number, emailAddress: string): Promise<OAuthConnectionStatus> {
  const context: LogContext = { operation: 'get-connection-status', businessId, emailAddress };
  try {
    const tokenResult = await query(
      'SELECT created_at, updated_at, expiry_date FROM oauth_tokens WHERE business_id = $1 AND email_address = $2 AND provider = $3',
      [businessId, emailAddress, 'outlook']
    );
    const emailResult = await query(
      'SELECT id FROM monitored_emails WHERE business_id = $1 AND email_address = $2',
      [businessId, emailAddress]
    );
    const isConnected = tokenResult.rows.length > 0 && emailResult.rows.length > 0;
    const connectedAt = tokenResult.rows.length > 0 ? (tokenResult.rows[0] as any).created_at : null;
    const tokenExpiry = tokenResult.rows.length > 0 ? (tokenResult.rows[0] as any).expiry_date : undefined;
    oauthLogger.debug('Microsoft OAuth connection status retrieved', {
      ...context,
      metadata: { isConnected, connectedAt, tokenExpiry }
    });
    return { isConnected, connectedAt, provider: 'outlook', tokenExpiry };
  } catch (error) {
    oauthLogger.error('Failed to get Microsoft OAuth connection status', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.DATABASE_QUERY_ERROR, 'Failed to get OAuth connection status');
  }
}

export async function disconnect(businessId: number, emailAddress: string): Promise<void> {
  const context: LogContext = { operation: 'disconnect-oauth', businessId, emailAddress };
  try {
    await query('DELETE FROM oauth_tokens WHERE business_id = $1 AND email_address = $2 AND provider = $3', [businessId, emailAddress, 'outlook']);
    oauthLogger.info('Microsoft OAuth disconnected successfully', context);
  } catch (error) {
    oauthLogger.error('Failed to disconnect Microsoft OAuth', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.DATABASE_QUERY_ERROR, 'Failed to disconnect OAuth');
  }
}

export async function validateState(state: string): Promise<OAuthState> {
  return validateOAuthState(state, 'outlook');
}

