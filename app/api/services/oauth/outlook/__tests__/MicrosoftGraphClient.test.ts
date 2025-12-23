/**
 * Microsoft Graph Client Tests
 * Tests Graph API client functionality
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';

// Mock logger
jest.mock('../../../../../utils/logger.js', () => ({
  oauthLogger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock error handler - must be before any imports that use it
jest.mock('../../../errorHandler.js', () => {
  const original = jest.requireActual('../../../errorHandler.js') as any;
  const { OAuthServiceError } = jest.requireActual('../../../../types/email.js') as any;
  const mockOAuthService = jest.fn((code: string, msg: string, statusCode = 500, details?: Record<string, unknown>) => {
    return new OAuthServiceError(msg, code, statusCode, details);
  });
  return {
    ErrorFactory: {
      oauthService: mockOAuthService
    },
    ErrorCodes: original.ErrorCodes
  };
});

describe('MicrosoftGraphClient', () => {
  let client: any;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    // Import after mocks are set up
    const { MicrosoftGraphClient } = require('../MicrosoftGraphClient.js');
    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    globalThis.fetch = mockFetch;
    client = new MicrosoftGraphClient('test-access-token');
    jest.clearAllMocks();
  });

  describe('createSubscription', () => {
    it('should create a subscription with all fields', async () => {
      const mockSubscription = {
        id: 'sub-123',
        resource: '/me/messages',
        changeType: 'created',
        notificationUrl: 'https://webhook.com',
        expirationDateTime: '2024-01-01T00:00:00Z'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockSubscription,
        headers: new Headers()
      } as Response);

      const result = await client.createSubscription(
        '/me/messages',
        'https://webhook.com',
        '2024-01-01T00:00:00Z',
        'client-state-123'
      );

      expect(result).toEqual(mockSubscription);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/subscriptions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-access-token'
          })
        })
      );
    });

    it('should create subscription without clientState', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 'sub-123' }),
        headers: new Headers()
      } as Response);

      await client.createSubscription('/me/messages', 'https://webhook.com', '2024-01-01T00:00:00Z');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(callBody.clientState).toBeUndefined();
    });
  });

  describe('renewSubscription', () => {
    it('should renew a subscription', async () => {
      const mockSubscription = {
        id: 'sub-123',
        expirationDateTime: '2024-01-02T00:00:00Z'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSubscription,
        headers: new Headers()
      } as Response);

      const result = await client.renewSubscription('sub-123', '2024-01-02T00:00:00Z');

      expect(result).toEqual(mockSubscription);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/subscriptions/sub-123',
        expect.objectContaining({
          method: 'PATCH'
        })
      );
    });
  });

  describe('deleteSubscription', () => {
    it('should delete a subscription', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
        headers: new Headers()
      } as Response);

      await client.deleteSubscription('sub-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/subscriptions/sub-123',
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
  });

  describe('listSubscriptions', () => {
    it('should list subscriptions', async () => {
      const mockResponse = {
        value: [
          { id: 'sub-1', resource: '/me/messages' },
          { id: 'sub-2', resource: '/me/messages' }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers()
      } as Response);

      const result = await client.listSubscriptions();

      expect(result.value).toHaveLength(2);
    });
  });

  describe('getMessage', () => {
    it('should get a message with selected fields', async () => {
      const mockMessage = {
        id: 'msg-123',
        subject: 'Test',
        body: { content: 'Body', contentType: 'HTML' }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockMessage,
        headers: new Headers()
      } as Response);

      const result = await client.getMessage('msg-123');

      expect(result).toEqual(mockMessage);
      expect(mockFetch.mock.calls[0][0]).toContain('/me/messages/msg-123');
      expect(mockFetch.mock.calls[0][0]).toContain('$select=');
    });
  });

  describe('listMessages', () => {
    it('should list messages with filters', async () => {
      const mockResponse = {
        value: [{ id: 'msg-1', subject: 'Test' }],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skip=10'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        headers: new Headers()
      } as Response);

      const result = await client.listMessages('receivedDateTime ge 2024-01-01', 10);

      expect(result.value).toHaveLength(1);
      expect(result['@odata.nextLink']).toBeDefined();
      const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
      expect(url).toContain('$filter=');
      expect(url).toContain('$top=10');
    });

    it('should list messages without filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ value: [] }),
        headers: new Headers()
      } as Response);

      await client.listMessages();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).not.toContain('$filter=');
    });
  });

  describe('listAllMessages', () => {
    it('should paginate through all messages', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            value: [{ id: 'msg-1' }],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skip=1'
          }),
          headers: new Headers()
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            value: [{ id: 'msg-2' }]
          }),
          headers: new Headers()
        } as Response);

      const result = await client.listAllMessages();

      expect(result).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should respect MAX_PAGES limit', async () => {
      // Create 101 pages of responses
      for (let i = 0; i < 101; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            value: [{ id: `msg-${i}` }],
            '@odata.nextLink': i < 100 ? `https://graph.microsoft.com/v1.0/me/messages?$skip=${i + 1}` : undefined
          }),
          headers: new Headers()
        } as Response);
      }

      const result = await client.listAllMessages();

      expect(result.length).toBeLessThanOrEqual(100);
      expect(mockFetch).toHaveBeenCalledTimes(100);
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
        headers: new Headers()
      } as Response);

      await client.deleteMessage('msg-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/messages/msg-123',
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle rate limit errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '60' }),
        json: async () => ({ error: { message: 'Rate limited' } })
      } as Response);

      await expect(
        client.createSubscription('/me/messages', 'https://webhook.com', '2024-01-01T00:00:00Z')
      ).rejects.toThrow();
    });

    it('should handle generic API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Internal error' } })
      } as Response);

      await expect(
        client.createSubscription('/me/messages', 'https://webhook.com', '2024-01-01T00:00:00Z')
      ).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        client.createSubscription('/me/messages', 'https://webhook.com', '2024-01-01T00:00:00Z')
      ).rejects.toThrow('Failed to communicate with Microsoft Graph API');
    });

    it('should handle 204 No Content responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
        headers: new Headers()
      } as Response);

      const result = await client.deleteSubscription('sub-123');

      expect(result).toEqual({});
    });

    it('should handle invalid JSON in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
        json: async () => {
          throw new Error('Invalid JSON');
        },
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
        client.createSubscription('/me/messages', 'https://webhook.com', '2024-01-01T00:00:00Z')
      ).rejects.toThrow();
    });
  });

  describe('URL handling', () => {
    it('should handle absolute URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ value: [] }),
        headers: new Headers()
      } as Response);

      await client.listSubscriptions();

      // Should use absolute URL as-is
      const url = mockFetch.mock.calls[0][0];
      expect(url).toBe('https://graph.microsoft.com/v1.0/subscriptions');
    });
  });
});

