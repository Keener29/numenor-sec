import { query } from '../../../../../db/connection.js';
import { oauthLogger } from '../../../../../utils/logger.js';
import { ErrorFactory, ErrorCodes } from '../../../errorHandler.js';
import type { OAuthTokens, OAuthState, OAuthConnectionStatus, LogContext } from '../../base/types.js';
import { validateOAuthState, generateNonce } from '../../base/stateValidation.js';
import { signOAuthState } from '../../base/stateSigning.js';
import { encryptToken, decryptToken } from '../../../../utils/tokenEncryption.js';

export async function generateAuthUrl(
  oauth2Client: any,
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
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify'
    ];

    const nonce = generateNonce();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5); // 5 minute expiry

    // Store nonce in database for verification
    await query(
      `INSERT INTO oauth_nonces (nonce, business_id, email_address, provider, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [nonce, businessId, emailAddress, 'gmail', expiresAt]
    );

    const state: OAuthState = {
      businessId,
      emailAddress,
      nonce,
      timestamp: Date.now(),
      provider: 'gmail'
    };

    // SECURITY: Sign state to prevent tampering
    const signedState = signOAuthState(state);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: signedState,
      prompt: 'consent'
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

export async function exchangeCodeForTokens(oauth2Client: any, code: string): Promise<OAuthTokens> {
  const context: LogContext = { operation: 'exchange-code-for-tokens' };
  try {
    oauthLogger.info('Exchanging authorization code for Gmail tokens', context);
    const { tokens } = await oauth2Client.getToken(code);
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

export async function storeTokens(
  businessId: number,
  emailAddress: string,
  tokens: OAuthTokens
): Promise<void> {
  const context: LogContext = { operation: 'store-tokens', businessId, emailAddress };
  try {
    oauthLogger.info('Storing Gmail OAuth tokens in database', context);
    const encryptedAccessToken = encryptToken(tokens.accessToken);
    const encryptedRefreshToken = encryptToken(tokens.refreshToken);
    
    const result = await query(
      `INSERT INTO oauth_tokens (business_id, email_address, provider, access_token, refresh_token, scope, token_type, expiry_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (business_id, email_address, provider)
       DO UPDATE SET access_token = EXCLUDED.access_token,
                     refresh_token = EXCLUDED.refresh_token,
                     scope = EXCLUDED.scope,
                     token_type = EXCLUDED.token_type,
                     expiry_date = EXCLUDED.expiry_date,
                     updated_at = CURRENT_TIMESTAMP`,
      [businessId, emailAddress, 'gmail', encryptedAccessToken, encryptedRefreshToken, tokens.scope, tokens.tokenType, tokens.expiryDate]
    );
    if (result.rows.length === 0) {
      throw new Error('Database accepted the query but no record was created or updated.');
    }
    oauthLogger.info('Gmail OAuth tokens stored successfully', context);
  } catch (error) {
    oauthLogger.error('Failed to store Gmail OAuth tokens', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.DATABASE_QUERY_ERROR, 'Failed to store OAuth tokens in database');
  }
}

export async function getTokens(businessId: number, emailAddress: string): Promise<OAuthTokens | null> {
  const context: LogContext = { operation: 'get-tokens', businessId, emailAddress };
  try {
    const result = await query(
      'SELECT access_token, refresh_token, scope, token_type, expiry_date FROM oauth_tokens WHERE business_id = $1 AND email_address = $2 AND provider = $3',
      [businessId, emailAddress, 'gmail']
    );
    if (result.rows.length === 0) {
      oauthLogger.debug('No Gmail OAuth tokens found', context);
      return null;
    }
    const row = result.rows[0] as any;
    const accessToken = decryptToken(row.access_token);
    const refreshToken = decryptToken(row.refresh_token);
    
    const tokens: OAuthTokens = {
      accessToken,
      refreshToken,
      scope: row.scope,
      tokenType: row.token_type,
      expiryDate: row.expiry_date
    };
    oauthLogger.debug('Gmail OAuth tokens retrieved successfully', context);
    return tokens;
  } catch (error) {
    oauthLogger.error('Failed to get Gmail OAuth tokens', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.DATABASE_QUERY_ERROR, 'Failed to retrieve OAuth tokens from database');
  }
}

export async function refreshTokenIfNeeded(
  oauth2Client: any,
  businessId: number,
  emailAddress: string
): Promise<OAuthTokens> {
  const context: LogContext = { operation: 'refresh-token-if-needed', businessId, emailAddress };
  try {
    const tokens = await getTokens(businessId, emailAddress);
    if (!tokens) {
      throw ErrorFactory.oauthService(ErrorCodes.OAUTH_TOKEN_REFRESH_FAILED, 'No Gmail OAuth tokens found for this email');
    }
    const now = Date.now();
    const expiryBuffer = 5 * 60 * 1000;
    if (tokens.expiryDate.getTime() - now < expiryBuffer) {
      oauthLogger.info('Refreshing expired Gmail OAuth token', context);
      oauth2Client.setCredentials({ refresh_token: tokens.refreshToken });
      const { credentials } = await oauth2Client.refreshAccessToken();
      const newTokens: OAuthTokens = {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || tokens.refreshToken,
        scope: credentials.scope || tokens.scope,
        tokenType: credentials.token_type || tokens.tokenType,
        expiryDate: new Date(credentials.expiry_date)
      };
      await storeTokens(businessId, emailAddress, newTokens);
      oauthLogger.info('Gmail OAuth token refreshed successfully', context);
      return newTokens;
    }
    return tokens;
  } catch (error) {
    oauthLogger.error('Failed to refresh Gmail OAuth token', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.OAUTH_TOKEN_REFRESH_FAILED, 'Failed to refresh OAuth token');
  }
}

export async function setCredentials(
  oauth2Client: any,
  businessId: number,
  emailAddress: string
): Promise<void> {
  const context: LogContext = { operation: 'set-credentials', businessId, emailAddress };
  try {
    const tokens = await refreshTokenIfNeeded(oauth2Client, businessId, emailAddress);
    oauth2Client.setCredentials({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
    oauthLogger.debug('Gmail OAuth credentials set successfully', context);
  } catch (error) {
    oauthLogger.error('Failed to set Gmail OAuth credentials', context, error as Error);
    throw error;
  }
}

export async function getConnectionStatus(businessId: number, emailAddress: string): Promise<OAuthConnectionStatus> {
  const context: LogContext = { operation: 'get-connection-status', businessId, emailAddress };
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
    const connectedAt = tokenResult.rows.length > 0 ? (tokenResult.rows[0] as any).created_at : null;
    const tokenExpiry = tokenResult.rows.length > 0 ? (tokenResult.rows[0] as any).expiry_date : undefined;
    oauthLogger.debug('Gmail OAuth connection status retrieved', {
      ...context,
      metadata: { isConnected, connectedAt, tokenExpiry }
    });
    return { isConnected, connectedAt, provider: 'gmail', tokenExpiry };
  } catch (error) {
    oauthLogger.error('Failed to get Gmail OAuth connection status', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.DATABASE_QUERY_ERROR, 'Failed to get OAuth connection status');
  }
}

export async function disconnect(businessId: number, emailAddress: string): Promise<void> {
  const context: LogContext = { operation: 'disconnect-oauth', businessId, emailAddress };
  try {
    await query('DELETE FROM oauth_tokens WHERE business_id = $1 AND email_address = $2 AND provider = $3', [businessId, emailAddress, 'gmail']);
    oauthLogger.info('Gmail OAuth disconnected successfully', context);
  } catch (error) {
    oauthLogger.error('Failed to disconnect Gmail OAuth', context, error as Error);
    throw ErrorFactory.oauthService(ErrorCodes.DATABASE_QUERY_ERROR, 'Failed to disconnect OAuth');
  }
}

export async function validateState(state: string): Promise<OAuthState> {
  return validateOAuthState(state, 'gmail');
}


