/**
 * OAuth Provider Factory
 * Manages different OAuth providers and provides a unified interface
 */

import { OAuthProvider } from './base/OAuthProvider.js';
import { gmailOAuthService } from './gmail/GmailOAuthService.js';
import { outlookOAuthService } from './outlook/OutlookOAuthService.js';
import type { OAuthProviderType } from './base/types.js';


export class OAuthProviderFactory {
  private static readonly providers = new Map<OAuthProviderType, OAuthProvider>([
    ['gmail', gmailOAuthService],
    ['microsoft', outlookOAuthService],
  ]);

  /**
   * Get OAuth provider by type
   */
  static getProvider(provider: OAuthProviderType): OAuthProvider {
    const oauthProvider = this.providers.get(provider);
    
    if (!oauthProvider) {
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }
    
    return oauthProvider;
  }

  /**
   * Get all available providers
   */
  static getAvailableProviders(): OAuthProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if provider is supported
   */
  static isProviderSupported(provider: string): provider is OAuthProviderType {
    return this.providers.has(provider as OAuthProviderType);
  }

  /**
   * Register a new provider
   */
  static registerProvider(provider: OAuthProviderType, oauthProvider: OAuthProvider): void {
    this.providers.set(provider, oauthProvider);
  }
}

// Export individual services for direct access
export { gmailOAuthService } from './gmail/GmailOAuthService.js';
export { outlookOAuthService } from './outlook/OutlookOAuthService.js';

// Export types
export type { OAuthProviderType } from './base/types.js';
export type { OAuthTokens, OAuthState, OAuthConnectionStatus, EmailMessage } from './base/types.js';
