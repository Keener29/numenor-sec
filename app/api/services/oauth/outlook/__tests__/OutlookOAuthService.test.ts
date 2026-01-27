/**
 * Outlook OAuth Service Tests
 * Tests OutlookOAuthService functionality
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { OutlookOAuthService } from '../OutlookOAuthService.js';

// Mock logger
jest.mock('../../../../../utils/logger.js', () => ({
  oauthLogger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock OutlookAuth module
const mockGenerateAuthUrl = jest.fn() as jest.MockedFunction<any>;
const mockExchangeCodeForTokens = jest.fn() as jest.MockedFunction<any>;
const mockStoreTokens = jest.fn() as jest.MockedFunction<any>;
const mockGetTokens = jest.fn() as jest.MockedFunction<any>;
const mockRefreshTokenIfNeeded = jest.fn() as jest.MockedFunction<any>;
const mockGetConnectionStatus = jest.fn() as jest.MockedFunction<any>;
const mockDisconnect = jest.fn() as jest.MockedFunction<any>;
const mockValidateState = jest.fn() as jest.MockedFunction<any>;

jest.mock('../OutlookAuth.js', () => ({
  generateAuthUrl: (...args: any[]) => mockGenerateAuthUrl(...args),
  exchangeCodeForTokens: (...args: any[]) => mockExchangeCodeForTokens(...args),
  storeTokens: (...args: any[]) => mockStoreTokens(...args),
  getTokens: (...args: any[]) => mockGetTokens(...args),
  refreshTokenIfNeeded: (...args: any[]) => mockRefreshTokenIfNeeded(...args),
  getConnectionStatus: (...args: any[]) => mockGetConnectionStatus(...args),
  disconnect: (...args: any[]) => mockDisconnect(...args),
  validateState: (...args: any[]) => mockValidateState(...args)
}));

// Mock MicrosoftGraphClient
const mockGraphClientInstance = {
  listMessages: jest.fn() as jest.MockedFunction<any>,
  getMessage: jest.fn() as jest.MockedFunction<any>,
  deleteMessage: jest.fn() as jest.MockedFunction<any>
};

jest.mock('../MicrosoftGraphClient.js', () => ({
  MicrosoftGraphClient: jest.fn().mockImplementation(() => mockGraphClientInstance)
}));

// Mock MicrosoftEmailAdapter
const mockParseGraphMessage = jest.fn() as jest.MockedFunction<any>;
jest.mock('../MicrosoftEmailAdapter.js', () => ({
  parseGraphMessage: (...args: any[]) => mockParseGraphMessage(...args)
}));

// Mock MicrosoftSubscriptionService
const mockCreateSubscription = jest.fn() as jest.MockedFunction<any>;
const mockDeleteSubscription = jest.fn() as jest.MockedFunction<any>;

jest.mock('../MicrosoftSubscriptionService.js', () => ({
  microsoftSubscriptionService: {
    createSubscription: (...args: any[]) => mockCreateSubscription(...args),
    deleteSubscription: (...args: any[]) => mockDeleteSubscription(...args)
  }
}));

// Mock distributed lock
const mockWithLock = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../../../utils/distributedLock.js', () => ({
  withLock: (...args: any[]) => mockWithLock(...args)
}));

// Mock concurrency limiter
const mockConcurrencyLimiter = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../../../utils/concurrencyLimiter.js', () => {
  const mockLimiter = jest.fn() as jest.MockedFunction<any>;
  return {
    createConcurrencyLimiter: jest.fn().mockReturnValue(mockLimiter)
  };
});

// Mock error handler
jest.mock('../../../errorHandler.js', () => {
  const original = jest.requireActual('../../../errorHandler.js') as any;
  const { OAuthServiceError } = jest.requireActual('../../../../types/email.js') as any;
  return {
    ErrorFactory: {
      oauthService: jest.fn((code: string, msg: string, statusCode = 500, details?: Record<string, unknown>) => {
        return new OAuthServiceError(msg, code, statusCode, details);
      })
    },
    ErrorCodes: original.ErrorCodes
  };
});

describe('OutlookOAuthService', () => {
  let service: OutlookOAuthService;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up default env vars
    process.env = {
      ...originalEnv,
      AZURE_CLIENT_ID: 'test-client-id',
      AZURE_CLIENT_SECRET: 'test-client-secret',
      AZURE_REDIRECT_URI: 'https://redirect.example.com',
      API_URL: 'https://api.example.com'
    };

    service = new OutlookOAuthService();
    
    // Default mock implementations
    mockWithLock.mockImplementation(async (_key: any, fn: any) => fn());
    const concurrencyLimiterModule = require('../../../../utils/concurrencyLimiter.js');
    const limiter = concurrencyLimiterModule.createConcurrencyLimiter(3);
    limiter.mockImplementation(async (fn: any) => fn());
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with environment variables', () => {
      const newService = new OutlookOAuthService();
      expect(newService.getProviderType()).toBe('microsoft');
    });

    it('should handle missing credentials gracefully', () => {
      process.env.AZURE_CLIENT_ID = '';
      process.env.AZURE_CLIENT_SECRET = '';
      const newService = new OutlookOAuthService();
      expect(newService.getProviderType()).toBe('microsoft');
    });
  });

  describe('generateAuthUrl', () => {
    it('should generate auth URL successfully', async () => {
      mockGenerateAuthUrl.mockResolvedValue('https://login.microsoftonline.com/oauth2/v2.0/authorize?...');

      const url = await service.generateAuthUrl(1, 'test@example.com');

      expect(url).toBe('https://login.microsoftonline.com/oauth2/v2.0/authorize?...');
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        'test-client-id',
        'https://redirect.example.com',
        1,
        'test@example.com'
      );
    });

    it('should throw error when client ID is missing', async () => {
      process.env.AZURE_CLIENT_ID = '';
      const newService = new OutlookOAuthService();
      
      await expect(newService.generateAuthUrl(1, 'test@example.com')).rejects.toThrow('Microsoft OAuth not configured');
    });

    it('should throw error when redirect URI is missing', async () => {
      process.env.AZURE_REDIRECT_URI = '';
      const newService = new OutlookOAuthService();
      
      await expect(newService.generateAuthUrl(1, 'test@example.com')).rejects.toThrow('Microsoft OAuth not configured');
    });
  });

  describe('exchangeCodeForTokens', () => {
    const mockTokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      scope: 'Mail.ReadWrite offline_access',
      tokenType: 'Bearer',
      expiryDate: new Date(Date.now() + 3600000)
    };

    it('should exchange code for tokens successfully', async () => {
      mockExchangeCodeForTokens.mockResolvedValue(mockTokens);

      const result = await service.exchangeCodeForTokens('auth-code');

      expect(result).toEqual(mockTokens);
      expect(mockExchangeCodeForTokens).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret',
        'https://redirect.example.com',
        'auth-code'
      );
    });

    it('should throw error when credentials are missing', async () => {
      process.env.AZURE_CLIENT_ID = '';
      const newService = new OutlookOAuthService();
      
      await expect(newService.exchangeCodeForTokens('auth-code')).rejects.toThrow('Microsoft OAuth not configured');
    });
  });

  describe('storeTokens', () => {
    const mockTokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      scope: 'Mail.ReadWrite offline_access',
      tokenType: 'Bearer',
      expiryDate: new Date()
    };

    it('should store tokens and create subscription', async () => {
      mockStoreTokens.mockResolvedValue(undefined);
      mockCreateSubscription.mockResolvedValue({ id: 'sub-123' });

      await service.storeTokens(1, 'test@example.com', mockTokens);

      expect(mockStoreTokens).toHaveBeenCalledWith(1, 'test@example.com', mockTokens);
      expect(mockCreateSubscription).toHaveBeenCalledWith(
        1,
        'test@example.com',
        'access-token',
        'https://api.example.com/api/microsoft-notify',
        expect.objectContaining({ operation: 'create-subscription' })
      );
    });

    it('should store tokens even if subscription creation fails', async () => {
      mockStoreTokens.mockResolvedValue(undefined);
      mockCreateSubscription.mockRejectedValue(new Error('Subscription failed'));

      await service.storeTokens(1, 'test@example.com', mockTokens);

      expect(mockStoreTokens).toHaveBeenCalled();
      expect(mockCreateSubscription).toHaveBeenCalled();
    });

    it('should skip subscription creation when webhook URL is missing', async () => {
      process.env.API_URL = '';
      const newService = new OutlookOAuthService();
      mockStoreTokens.mockResolvedValue(undefined);

      await newService.storeTokens(1, 'test@example.com', mockTokens);

      expect(mockStoreTokens).toHaveBeenCalled();
      expect(mockCreateSubscription).not.toHaveBeenCalled();
    });
  });

  describe('getTokens', () => {
    it('should retrieve tokens successfully', async () => {
      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        scope: 'Mail.ReadWrite',
        tokenType: 'Bearer',
        expiryDate: new Date()
      };
      mockGetTokens.mockResolvedValue(mockTokens);

      const result = await service.getTokens(1, 'test@example.com');

      expect(result).toEqual(mockTokens);
      expect(mockGetTokens).toHaveBeenCalledWith(1, 'test@example.com');
    });

    it('should return null when no tokens found', async () => {
      mockGetTokens.mockResolvedValue(null);

      const result = await service.getTokens(1, 'test@example.com');

      expect(result).toBeNull();
    });
  });

  describe('refreshTokenIfNeeded', () => {
    const mockTokens = {
      accessToken: 'new-access-token',
      refreshToken: 'refresh-token',
      scope: 'https://graph.microsoft.com/Mail.ReadWrite offline_access',
      tokenType: 'Bearer',
      expiryDate: new Date(Date.now() + 3600000)
    };

    it('should refresh token successfully with valid scopes', async () => {
      mockWithLock.mockImplementation(async (_key: any, fn: any) => fn());
      mockRefreshTokenIfNeeded.mockResolvedValue(mockTokens);

      const result = await service.refreshTokenIfNeeded(1, 'test@example.com');

      expect(result).toEqual(mockTokens);
      expect(mockWithLock).toHaveBeenCalledWith(
        'oauth:refresh:1:test@example.com',
        expect.any(Function),
        10000
      );
      expect(mockRefreshTokenIfNeeded).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret',
        1,
        'test@example.com'
      );
    });

    it('should throw error when credentials are missing', async () => {
      process.env.AZURE_CLIENT_ID = '';
      const newService = new OutlookOAuthService();
      
      await expect(newService.refreshTokenIfNeeded(1, 'test@example.com')).rejects.toThrow('Microsoft OAuth not configured');
    });

    it('should throw error when token missing required scopes', async () => {
      const tokensWithoutScopes = {
        ...mockTokens,
        scope: 'User.Read'
      };
      mockRefreshTokenIfNeeded.mockResolvedValue(tokensWithoutScopes);

      await expect(service.refreshTokenIfNeeded(1, 'test@example.com')).rejects.toThrow('Token missing required scopes');
    });

    it('should accept scopes in different formats', async () => {
      const tokensWithShortScopes = {
        ...mockTokens,
        scope: 'Mail.ReadWrite offline_access'
      };
      mockRefreshTokenIfNeeded.mockResolvedValue(tokensWithShortScopes);

      const result = await service.refreshTokenIfNeeded(1, 'test@example.com');

      expect(result).toEqual(tokensWithShortScopes);
    });
  });

  describe('setCredentials', () => {
    it('should refresh token if needed', async () => {
      const mockTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        scope: 'https://graph.microsoft.com/Mail.ReadWrite offline_access',
        tokenType: 'Bearer',
        expiryDate: new Date()
      };
      mockRefreshTokenIfNeeded.mockResolvedValue(mockTokens);
      mockWithLock.mockImplementation(async (_key: any, fn: any) => fn());

      await service.setCredentials(1, 'test@example.com');

      expect(mockRefreshTokenIfNeeded).toHaveBeenCalled();
    });
  });

  describe('fetchEmails', () => {
    const mockTokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      scope: 'https://graph.microsoft.com/Mail.ReadWrite offline_access',
      tokenType: 'Bearer',
      expiryDate: new Date()
    };

    const mockGraphMessages = [
      { id: 'msg-1', subject: 'Test 1', receivedDateTime: '2024-01-01T00:00:00Z' },
      { id: 'msg-2', subject: 'Test 2', receivedDateTime: '2024-01-02T00:00:00Z' }
    ];

    const mockEmailMessages = [
      {
        id: 'msg-1',
        subject: 'Test 1',
        body: 'Body 1',
        sender: 'sender1@example.com',
        recipient: 'test@example.com',
        timestamp: new Date('2024-01-01T00:00:00Z'),
        headers: {},
        links: [],
        attachments: []
      },
      {
        id: 'msg-2',
        subject: 'Test 2',
        body: 'Body 2',
        sender: 'sender2@example.com',
        recipient: 'test@example.com',
        timestamp: new Date('2024-01-02T00:00:00Z'),
        headers: {},
        links: [],
        attachments: []
      }
    ];

    beforeEach(() => {
      mockRefreshTokenIfNeeded.mockResolvedValue(mockTokens);
      mockWithLock.mockImplementation(async (_key: any, fn: any) => fn());
    });

    it('should fetch emails successfully', async () => {
      mockGraphClientInstance.listMessages.mockResolvedValue({ value: mockGraphMessages });
      mockGraphClientInstance.getMessage
        .mockResolvedValueOnce({ ...mockGraphMessages[0], body: { content: 'Body 1' } })
        .mockResolvedValueOnce({ ...mockGraphMessages[1], body: { content: 'Body 2' } });
      mockParseGraphMessage
        .mockReturnValueOnce(mockEmailMessages[0])
        .mockReturnValueOnce(mockEmailMessages[1]);

      const result = await service.fetchEmails(1, 'test@example.com', 10);

      expect(result).toHaveLength(2);
      expect(mockGraphClientInstance.listMessages).toHaveBeenCalled();
      expect(mockGraphClientInstance.getMessage).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when no messages found', async () => {
      mockGraphClientInstance.listMessages.mockResolvedValue({ value: [] });

      const result = await service.fetchEmails(1, 'test@example.com', 10);

      expect(result).toEqual([]);
    });

    it('should filter by connection timestamp', async () => {
      const connectionTimestamp = new Date('2024-01-01T00:00:00Z');
      mockGraphClientInstance.listMessages.mockResolvedValue({ value: mockGraphMessages });

      await service.fetchEmails(1, 'test@example.com', 10, '', connectionTimestamp);

      expect(mockGraphClientInstance.listMessages).toHaveBeenCalledWith(
        expect.stringContaining('receivedDateTime ge'),
        10,
        expect.any(Object)
      );
    });

    it('should handle message fetch failures gracefully', async () => {
      mockGraphClientInstance.listMessages.mockResolvedValue({ value: mockGraphMessages });
      mockGraphClientInstance.getMessage
        .mockRejectedValueOnce(new Error('Fetch failed'))
        .mockResolvedValueOnce({ ...mockGraphMessages[1], body: { content: 'Body 2' } });
      mockParseGraphMessage
        .mockReturnValueOnce(mockEmailMessages[0]) // Fallback in catch block for failed message
        .mockReturnValueOnce(mockEmailMessages[1]); // Successful message

      const result = await service.fetchEmails(1, 'test@example.com', 10);

      expect(result).toHaveLength(2);
      // parseGraphMessage is called: 1) in catch block for failed message (fallback), 2) for successful message
      expect(mockParseGraphMessage).toHaveBeenCalledTimes(2);
    });

    it('should throw error on fetch failure', async () => {
      mockRefreshTokenIfNeeded.mockRejectedValue(new Error('Token refresh failed'));

      await expect(service.fetchEmails(1, 'test@example.com', 10)).rejects.toThrow('Failed to fetch emails');
    });
  });

  describe('deleteEmail', () => {
    const mockTokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      scope: 'https://graph.microsoft.com/Mail.ReadWrite offline_access',
      tokenType: 'Bearer',
      expiryDate: new Date()
    };

    beforeEach(() => {
      mockRefreshTokenIfNeeded.mockResolvedValue(mockTokens);
      mockWithLock.mockImplementation(async (_key: any, fn: any) => fn());
    });

    it('should delete email successfully', async () => {
      mockGraphClientInstance.deleteMessage.mockResolvedValue({});

      await service.deleteEmail(1, 'test@example.com', 'msg-123');

      expect(mockGraphClientInstance.deleteMessage).toHaveBeenCalledWith('msg-123', expect.any(Object));
    });

    it('should throw error on delete failure', async () => {
      mockGraphClientInstance.deleteMessage.mockRejectedValue(new Error('Delete failed'));

      await expect(service.deleteEmail(1, 'test@example.com', 'msg-123')).rejects.toThrow('Failed to delete email');
    });
  });

  describe('moveToTrash', () => {
    const mockTokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      scope: 'https://graph.microsoft.com/Mail.ReadWrite offline_access',
      tokenType: 'Bearer',
      expiryDate: new Date()
    };

    beforeEach(() => {
      mockRefreshTokenIfNeeded.mockResolvedValue(mockTokens);
      mockWithLock.mockImplementation(async (_key: any, fn: any) => fn());
    });

    it('should move email to trash successfully', async () => {
      mockGraphClientInstance.deleteMessage.mockResolvedValue({});

      await service.moveToTrash(1, 'test@example.com', 'msg-123');

      expect(mockGraphClientInstance.deleteMessage).toHaveBeenCalledWith('msg-123', expect.any(Object));
    });

    it('should throw error on move failure', async () => {
      mockGraphClientInstance.deleteMessage.mockRejectedValue(new Error('Move failed'));

      await expect(service.moveToTrash(1, 'test@example.com', 'msg-123')).rejects.toThrow('Failed to move email to trash');
    });
  });

  describe('getConnectionStatus', () => {
    it('should get connection status successfully', async () => {
      const mockStatus = {
        isConnected: true,
        connectedAt: new Date(),
        provider: 'microsoft' as const
      };
      mockGetConnectionStatus.mockResolvedValue(mockStatus);

      const result = await service.getConnectionStatus(1, 'test@example.com');

      expect(result).toEqual(mockStatus);
      expect(mockGetConnectionStatus).toHaveBeenCalledWith(1, 'test@example.com');
    });
  });

  describe('disconnect', () => {
    const mockTokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      scope: 'Mail.ReadWrite',
      tokenType: 'Bearer',
      expiryDate: new Date()
    };

    it('should disconnect successfully', async () => {
      mockGetTokens.mockResolvedValue(mockTokens);
      mockDeleteSubscription.mockResolvedValue({});
      mockDisconnect.mockResolvedValue(undefined);

      await service.disconnect(1, 'test@example.com');

      expect(mockDeleteSubscription).toHaveBeenCalledWith(
        1,
        'test@example.com',
        'access-token',
        expect.any(Object)
      );
      expect(mockDisconnect).toHaveBeenCalledWith(1, 'test@example.com');
    });

    it('should disconnect even if subscription deletion fails', async () => {
      mockGetTokens.mockResolvedValue(mockTokens);
      mockDeleteSubscription.mockRejectedValue(new Error('Delete failed'));
      mockDisconnect.mockResolvedValue(undefined);

      await service.disconnect(1, 'test@example.com');

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should disconnect when no tokens found', async () => {
      mockGetTokens.mockResolvedValue(null);
      mockDisconnect.mockResolvedValue(undefined);

      await service.disconnect(1, 'test@example.com');

      expect(mockDeleteSubscription).not.toHaveBeenCalled();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should throw error on disconnect failure', async () => {
      mockGetTokens.mockResolvedValue(mockTokens);
      mockDeleteSubscription.mockResolvedValue({});
      mockDisconnect.mockRejectedValue(new Error('Disconnect failed'));

      await expect(service.disconnect(1, 'test@example.com')).rejects.toThrow('Failed to disconnect OAuth');
    });
  });

  describe('validateState', () => {
    it('should validate state successfully', async () => {
      const mockState = {
        businessId: 1,
        emailAddress: 'test@example.com',
        nonce: 'nonce-123',
        timestamp: Date.now()
      };
      mockValidateState.mockResolvedValue(mockState);

      const result = await service.validateState('state-token');

      expect(result).toEqual(mockState);
      expect(mockValidateState).toHaveBeenCalledWith('state-token');
    });
  });

  describe('testConnection', () => {
    const mockTokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      scope: 'https://graph.microsoft.com/Mail.ReadWrite offline_access',
      tokenType: 'Bearer',
      expiryDate: new Date()
    };

    beforeEach(() => {
      mockRefreshTokenIfNeeded.mockResolvedValue(mockTokens);
      mockWithLock.mockImplementation(async (_key: any, fn: any) => fn());
    });

    it('should test connection successfully', async () => {
      const mockMessages = [
        { id: 'msg-1', subject: 'Test 1', sender: { emailAddress: { address: 'sender@example.com' } } },
        { id: 'msg-2', subject: 'Test 2', sender: { emailAddress: { address: 'sender2@example.com' } } }
      ];
      mockGraphClientInstance.listMessages.mockResolvedValue({ value: mockMessages });

      const result = await service.testConnection(1, 'test@example.com');

      expect(result.success).toBe(true);
      expect(result.emailCount).toBe(2);
      expect(result.emails).toHaveLength(2);
      expect(result.emails?.[0].id).toBe('msg-1');
    });

    it('should return failure on connection error', async () => {
      mockRefreshTokenIfNeeded.mockRejectedValue(new Error('Connection failed'));

      const result = await service.testConnection(1, 'test@example.com');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Microsoft Graph connection test failed');
      expect(result.details).toBe('Connection failed');
    });

    it('should handle empty message list', async () => {
      mockGraphClientInstance.listMessages.mockResolvedValue({ value: [] });

      const result = await service.testConnection(1, 'test@example.com');

      expect(result.success).toBe(true);
      expect(result.emailCount).toBe(0);
      expect(result.emails).toEqual([]);
    });
  });
});

