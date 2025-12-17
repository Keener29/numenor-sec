/**
 * Base OAuth Types
 * Common types and interfaces for all OAuth providers
 */

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  scope: string;
  tokenType: string;
  expiryDate: Date;
}

export interface OAuthState {
  businessId: number;
  emailAddress: string;
  nonce: string;
  timestamp: number;
  provider?: string;
}

export interface OAuthConnectionStatus {
  isConnected: boolean;
  connectedAt: Date | null;
  provider: string;
  tokenExpiry?: Date;
}

// Re-export EmailMessage from canonical types location
export type { EmailMessage } from '../../../types/email.js';

export interface LogContext {
  operation: string;
  businessId?: number;
  emailAddress?: string;
  metadata?: Record<string, any>;
}

export type OAuthProviderType = 'gmail' | 'outlook';

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}
