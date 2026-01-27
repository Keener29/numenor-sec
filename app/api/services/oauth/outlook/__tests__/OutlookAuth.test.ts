/**
 * Outlook Auth Tests
 * Tests OAuth authentication and token management
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import {
  generateAuthUrl,
  exchangeCodeForTokens,
  storeTokens,
  getTokens,
  refreshTokenIfNeeded,
  getConnectionStatus,
  disconnect,
  validateState
} from '../OutlookAuth.js';

// Mock logger
jest.mock('../../../../../utils/logger.js', () => ({
  oauthLogger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock database
jest.mock('../../../../../db/connection.js', () => ({
  query: jest.fn()
}));

// Mock error handler
jest.mock('../../../errorHandler.js', () => {
  const original = jest.requireActual('../../../errorHandler.js') as any;
  return {
    ErrorFactory: {
      oauthService: jest.fn((code: string, msg: string) => {
        const error = new Error(msg);
        (error as any).code = code;
        return error;
      })
    },
    ErrorCodes: original.ErrorCodes
  };
});

// Mock state validation
jest.mock('../../base/stateValidation.js', () => {
  const mockValidate = jest.fn<(state: string, expectedProvider: 'gmail' | 'microsoft') => Promise<{ businessId: number; emailAddress: string; nonce: string; timestamp: number; provider: string }>>().mockResolvedValue({
    businessId: 1,
    emailAddress: 'test@example.com',
    nonce: 'nonce-123',
    timestamp: Date.now(),
    provider: 'microsoft'
  });
  return {
    validateOAuthState: mockValidate,
    generateNonce: jest.fn().mockReturnValue('nonce-123')
  };
});

// Mock state signing
jest.mock('../../base/stateSigning.js', () => ({
  signOAuthState: jest.fn().mockReturnValue('signed-state-123')
}));

describe('OutlookAuth', () => {
  let mockQuery: jest.MockedFunction<any>;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    globalThis.fetch = mockFetch;
    
    const dbModule = require('../../../../../db/connection.js');
    mockQuery = dbModule.query;
  });

  describe('generateAuthUrl', () => {
    it('should generate OAuth URL with correct parameters', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const url = await generateAuthUrl(
        'client-id-123',
        'https://redirect.com',
        1,
        'test@example.com'
      );

      expect(url).toContain('login.microsoftonline.com');
      expect(url).toContain('client_id=client-id-123');
      expect(url).toContain('redirect_uri=https%3A%2F%2Fredirect.com');
      expect(url).toContain('scope=');
      expect(url).toContain('state=signed-state-123');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO oauth_nonces'),
        expect.arrayContaining(['nonce-123', 1, 'test@example.com', 'microsoft'])
      );
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      await expect(
        generateAuthUrl('client-id', 'https://redirect.com', 1, 'test@example.com')
      ).rejects.toThrow('Failed to generate authorization URL');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange code for tokens', async () => {
      const mockTokenResponse = {
        access_token: 'access-123',
        refresh_token: 'refresh-123',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'Mail.ReadWrite offline_access'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockTokenResponse,
        headers: new Headers()
      } as Response);

      const tokens = await exchangeCodeForTokens(
        'client-id',
        'client-secret',
        'https://redirect.com',
        'auth-code-123'
      );

      expect(tokens.accessToken).toBe('access-123');
      expect(tokens.refreshToken).toBe('refresh-123');
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiryDate).toBeInstanceOf(Date);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded'
          })
        })
      );
    });

    it('should handle token exchange errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code'
        }),
        headers: new Headers(),
        statusText: 'Bad Request',
        redirected: false,
        type: 'default',
        url: '',
        clone: jest.fn(),
        body: null,
        bodyUsed: false,
        arrayBuffer: jest.fn(),
        blob: jest.fn(),
        formData: jest.fn(),
        text: jest.fn()
      } as unknown as Response);

      await expect(
        exchangeCodeForTokens('client-id', 'secret', 'redirect', 'invalid-code')
      ).rejects.toThrow('Failed to exchange authorization code for tokens');
    });

    it('should handle missing expires_in', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'access-123',
          refresh_token: 'refresh-123',
          token_type: 'Bearer'
        }),
        headers: new Headers()
      } as Response);

      const tokens = await exchangeCodeForTokens('client-id', 'secret', 'redirect', 'code');

      expect(tokens.expiryDate).toBeInstanceOf(Date);
    });

    it('should handle invalid JSON in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
        headers: new Headers(),
        statusText: 'Internal Server Error',
        redirected: false,
        type: 'default',
        url: '',
        clone: jest.fn(),
        body: null,
        bodyUsed: false,
        arrayBuffer: jest.fn(),
        blob: jest.fn(),
        formData: jest.fn(),
        text: jest.fn()
      } as unknown as Response);

      await expect(
        exchangeCodeForTokens('client-id', 'secret', 'redirect', 'code')
      ).rejects.toThrow();
    });
  });

  describe('storeTokens', () => {
    it('should store tokens in database', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const tokens = {
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        scope: 'Mail.ReadWrite',
        tokenType: 'Bearer',
        expiryDate: new Date()
      };

      await storeTokens(1, 'test@example.com', tokens);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO oauth_tokens'),
        expect.arrayContaining([1, 'test@example.com', 'microsoft', 'access-123', 'refresh-123'])
      );
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      await expect(
        storeTokens(1, 'test@example.com', {
          accessToken: 'token',
          refreshToken: 'refresh',
          scope: 'scope',
          tokenType: 'Bearer',
          expiryDate: new Date()
        })
      ).rejects.toThrow('Failed to store OAuth tokens in database');
    });
  });

  describe('getTokens', () => {
    it('should retrieve tokens from database', async () => {
      const mockRow = {
        access_token: 'access-123',
        refresh_token: 'refresh-123',
        scope: 'Mail.ReadWrite',
        token_type: 'Bearer',
        expiry_date: new Date()
      };

      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const tokens = await getTokens(1, 'test@example.com');

      expect(tokens).not.toBeNull();
      expect(tokens?.accessToken).toBe('access-123');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [1, 'test@example.com', 'microsoft']
      );
    });

    it('should return null when no tokens found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const tokens = await getTokens(1, 'test@example.com');

      expect(tokens).toBeNull();
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      await expect(getTokens(1, 'test@example.com')).rejects.toThrow();
    });
  });

  describe('refreshTokenIfNeeded', () => {
    it('should return existing token if not expired', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);

      mockQuery.mockResolvedValueOnce({
        rows: [{
          access_token: 'access-123',
          refresh_token: 'refresh-123',
          scope: 'Mail.ReadWrite',
          token_type: 'Bearer',
          expiry_date: futureDate
        }]
      });

      const tokens = await refreshTokenIfNeeded('client-id', 'secret', 1, 'test@example.com');

      expect(tokens.accessToken).toBe('access-123');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should refresh token when expired', async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            access_token: 'old-access',
            refresh_token: 'refresh-123',
            scope: 'Mail.ReadWrite',
            token_type: 'Bearer',
            expiry_date: pastDate
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'Mail.ReadWrite'
        }),
        headers: new Headers()
      } as Response);

      const tokens = await refreshTokenIfNeeded('client-id', 'secret', 1, 'test@example.com');

      expect(tokens.accessToken).toBe('new-access');
      expect(mockFetch).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should keep old refresh token if not provided', async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            access_token: 'old-access',
            refresh_token: 'old-refresh',
            scope: 'Mail.ReadWrite',
            token_type: 'Bearer',
            expiry_date: pastDate
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'new-access',
          expires_in: 3600,
          token_type: 'Bearer'
        }),
        headers: new Headers()
      } as Response);

      const tokens = await refreshTokenIfNeeded('client-id', 'secret', 1, 'test@example.com');

      expect(tokens.refreshToken).toBe('old-refresh');
    });

    it('should throw error when no tokens found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(
        refreshTokenIfNeeded('client-id', 'secret', 1, 'test@example.com')
      ).rejects.toThrow('Failed to refresh OAuth token');
    });

    it('should handle refresh errors', async () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);

      mockQuery.mockResolvedValueOnce({
        rows: [{
          access_token: 'old-access',
          refresh_token: 'refresh-123',
          scope: 'Mail.ReadWrite',
          token_type: 'Bearer',
          expiry_date: pastDate
        }]
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Token expired'
        }),
        headers: new Headers()
      } as Response);

      await expect(
        refreshTokenIfNeeded('client-id', 'secret', 1, 'test@example.com')
      ).rejects.toThrow();
    });
  });

  describe('getConnectionStatus', () => {
    it('should return connection status when connected', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-02'),
            expiry_date: new Date('2024-12-31')
          }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1 }]
        });

      const status = await getConnectionStatus(1, 'test@example.com');

      expect(status.isConnected).toBe(true);
      expect(status.provider).toBe('microsoft');
      expect(status.connectedAt).toBeInstanceOf(Date);
    });

    it('should return disconnected status when no tokens', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const status = await getConnectionStatus(1, 'test@example.com');

      expect(status.isConnected).toBe(false);
    });

    it('should return disconnected status when no monitored email', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            created_at: new Date(),
            updated_at: new Date(),
            expiry_date: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: [] });

      const status = await getConnectionStatus(1, 'test@example.com');

      expect(status.isConnected).toBe(false);
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      await expect(
        getConnectionStatus(1, 'test@example.com')
      ).rejects.toThrow();
    });
  });

  describe('disconnect', () => {
    it('should delete tokens from database', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await disconnect(1, 'test@example.com');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM oauth_tokens'),
        [1, 'test@example.com', 'microsoft']
      );
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('DB error'));

      await expect(disconnect(1, 'test@example.com')).rejects.toThrow();
    });
  });

  describe('validateState', () => {
    it('should validate OAuth state', async () => {
      const state = await validateState('signed-state-123');

      expect(state.businessId).toBe(1);
      expect(state.emailAddress).toBe('test@example.com');
      expect(state.provider).toBe('microsoft');
    });
  });
});

