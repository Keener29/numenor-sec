/**
 * Microsoft Subscription Service Tests
 * Tests subscription management for Microsoft Graph API
 */

import { describe, expect, it, beforeEach } from '@jest/globals';
import { MicrosoftSubscriptionService } from '../MicrosoftSubscriptionService.js';
import { MicrosoftGraphClient } from '../MicrosoftGraphClient.js';

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

// Mock MicrosoftGraphClient
jest.mock('../MicrosoftGraphClient.js', () => ({
  MicrosoftGraphClient: jest.fn()
}));

// Mock state signing
jest.mock('../../base/stateSigning.js', () => ({
  signClientState: jest.fn().mockReturnValue('signed-state-123')
}));

// Mock error handler
jest.mock('../../../errorHandler.js', () => {
  const original = jest.requireActual('../../../errorHandler.js');
  return {
    ErrorFactory: {
      oauthService: jest.fn((code, msg) => {
        const error = new Error(msg);
        (error as any).code = code;
        (error as any).statusCode = 500;
        return error;
      })
    },
    ErrorCodes: original.ErrorCodes
  };
});

describe('MicrosoftSubscriptionService', () => {
  let service: MicrosoftSubscriptionService;
  let mockGraphClient: jest.Mocked<MicrosoftGraphClient>;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MicrosoftSubscriptionService();
    
    mockGraphClient = {
      createSubscription: jest.fn(),
      renewSubscription: jest.fn(),
      deleteSubscription: jest.fn()
    } as any;
    
    (MicrosoftGraphClient as jest.Mock).mockImplementation(() => mockGraphClient);
    
    const dbModule = require('../../../../../db/connection.js');
    mockQuery = dbModule.query;
  });

  describe('createSubscription', () => {
    it('should create a new subscription', async () => {
      const mockSubscription = {
        id: 'sub-123',
        resource: '/me/messages',
        changeType: 'created',
        notificationUrl: 'https://webhook.example.com/notify',
        expirationDateTime: new Date().toISOString()
      };
      
      mockGraphClient.createSubscription.mockResolvedValue(mockSubscription);
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.createSubscription(
        1,
        'test@example.com',
        'access-token',
        'https://webhook.example.com/notify'
      );

      expect(result.businessId).toBe(1);
      expect(result.emailAddress).toBe('test@example.com');
      expect(result.subscriptionId).toBe('sub-123');
      expect(mockGraphClient.createSubscription).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should handle errors during creation', async () => {
      mockGraphClient.createSubscription.mockRejectedValue(new Error('API Error'));
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(
        service.createSubscription(1, 'test@example.com', 'token', 'https://webhook.com')
      ).rejects.toThrow('Failed to create Microsoft Graph subscription');
    });
  });

  describe('renewSubscription', () => {
    it('should renew an existing subscription', async () => {
      const mockDbRow = {
        subscription_id: 'sub-123',
        resource_path: '/me/messages',
        last_notification_date: null
      };
      
      mockQuery.mockResolvedValueOnce({ rows: [mockDbRow] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockGraphClient.renewSubscription.mockResolvedValue({
        id: 'sub-123',
        resource: '/me/messages',
        changeType: 'updated',
        notificationUrl: 'https://webhook.example.com/notify',
        expirationDateTime: new Date().toISOString()
      });

      const result = await service.renewSubscription(
        1,
        'test@example.com',
        'access-token'
      );

      expect(result.subscriptionId).toBe('sub-123');
      expect(mockGraphClient.renewSubscription).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should throw error when subscription not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(
        service.renewSubscription(1, 'test@example.com', 'token')
      ).rejects.toThrow();
    });
  });

  describe('deleteSubscription', () => {
    it('should delete a subscription', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ subscription_id: 'sub-123' }]
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockGraphClient.deleteSubscription.mockResolvedValue({} as any);

      await service.deleteSubscription(1, 'test@example.com', 'access-token');

      expect(mockGraphClient.deleteSubscription).toHaveBeenCalledWith('sub-123', expect.any(Object));
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should handle missing subscription gracefully', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(
        service.deleteSubscription(1, 'test@example.com', 'token')
      ).resolves.not.toThrow();
    });
  });

  describe('getSubscriptionsNeedingRenewal', () => {
    it('should return subscriptions expiring soon', async () => {
      const mockRows = [
        {
          business_id: 1,
          email_address: 'test@example.com',
          subscription_id: 'sub-123',
          resource_path: '/me/messages',
          expiration_date: new Date(Date.now() + 1000 * 60 * 60), // 1 hour
          last_notification_date: null
        }
      ];
      
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await service.getSubscriptionsNeedingRenewal();

      expect(result).toHaveLength(1);
      expect(result[0].subscriptionId).toBe('sub-123');
    });
  });

  describe('getSubscription', () => {
    it('should return subscription when found', async () => {
      const mockRow = {
        subscription_id: 'sub-123',
        resource_path: '/me/messages',
        expiration_date: new Date(),
        last_notification_date: null
      };
      
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await service.getSubscription(1, 'test@example.com');

      expect(result).not.toBeNull();
      expect(result?.subscriptionId).toBe('sub-123');
    });

    it('should return null when subscription not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.getSubscription(1, 'test@example.com');

      expect(result).toBeNull();
    });
  });

  describe('updateLastNotificationDate', () => {
    it('should update last notification date', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.updateLastNotificationDate(1, 'test@example.com');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE microsoft_subscriptions'),
        [1, 'test@example.com']
      );
    });
  });
});

