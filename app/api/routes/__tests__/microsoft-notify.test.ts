/**
 * Microsoft Notify Route Tests
 * Tests Microsoft Graph webhook notification handler
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import microsoftNotifyRoutes from '../microsoft-notify.js';

// Mock dependencies
jest.mock('../../../db/connection.js', () => ({
  query: jest.fn()
}));

jest.mock('../../../utils/logger.js', () => ({
  monitoringLogger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock microsoftEmailSyncService
const mockProcessMessageNotification = jest.fn();
jest.mock('../../services/emailMonitor/microsoftEmailSyncService.js', () => ({
  microsoftEmailSyncService: {
    processMessageNotification: (...args: any[]) => mockProcessMessageNotification(...args)
  }
}));

// Mock microsoftSubscriptionService
const mockUpdateLastNotificationDate = jest.fn();
jest.mock('../../services/oauth/outlook/MicrosoftSubscriptionService.js', () => ({
  microsoftSubscriptionService: {
    updateLastNotificationDate: (...args: any[]) => mockUpdateLastNotificationDate(...args)
  }
}));

// Mock stateSigning
const mockVerifyClientState = jest.fn();
jest.mock('../../services/oauth/base/stateSigning.js', () => ({
  verifyClientState: (...args: any[]) => mockVerifyClientState(...args)
}));

// Mock monitoredEmailUtils
const mockFindMonitoredEmail = jest.fn();
jest.mock('../../utils/monitoredEmailUtils.js', () => ({
  findMonitoredEmail: (...args: any[]) => mockFindMonitoredEmail(...args)
}));

// Mock microsoftGraphErrorUtils
const mockIsRetryableGraphError = jest.fn();
jest.mock('../../utils/microsoftGraphErrorUtils.js', () => ({
  isRetryableGraphError: (...args: any[]) => mockIsRetryableGraphError(...args)
}));

import { query } from '../../../db/connection.js';

describe('GET /api/microsoft-notify', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/microsoft-notify', microsoftNotifyRoutes);
    jest.clearAllMocks();
  });

  it('should return validationToken for webhook verification', async () => {
    const validationToken = 'test-validation-token-123';

    const response = await request(app)
      .get(`/api/microsoft-notify?validationToken=${validationToken}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toBe(validationToken);
  });

  it('should return 400 when validationToken is missing', async () => {
    const response = await request(app)
      .get('/api/microsoft-notify');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing validationToken');
  });
});

describe('POST /api/microsoft-notify', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/microsoft-notify', microsoftNotifyRoutes);
    jest.clearAllMocks();
    
    // Default mocks
    mockFindMonitoredEmail.mockResolvedValue({ id: 1, business_id: 1, email_address: 'test@example.com' } as never);
    mockUpdateLastNotificationDate.mockResolvedValue(undefined as never);
    mockProcessMessageNotification.mockResolvedValue(undefined as never);
    (query as any).mockResolvedValue({ rows: [] });
  });

  it('should accept notification and return 202 immediately', async () => {
    const notification = {
      value: [{
        subscriptionId: 'sub-123',
        changeType: 'created',
        resource: '/me/messages/msg-456',
        clientState: 'valid-state'
      }]
    };
    mockVerifyClientState.mockReturnValue({ businessId: 1, emailAddress: 'test@example.com' });
    (query as any).mockResolvedValueOnce({ rows: [] }); // isNotificationProcessed check
    (query as any).mockResolvedValueOnce({ rows: [] }); // markNotificationProcessed

    const response = await request(app)
      .post('/api/microsoft-notify')
      .send(notification);

    // Should return 202 immediately (before processing)
    expect(response.status).toBe(202);
    expect(response.body.status).toBe('accepted');
  });

  it('should skip subscription expiration notifications', async () => {
    const notification = {
      value: [{
        subscriptionId: 'sub-123',
        subscriptionExpirationDateTime: '2024-12-31T00:00:00Z'
      }]
    };

    const response = await request(app)
      .post('/api/microsoft-notify')
      .send(notification);

    expect(response.status).toBe(202);
    // Should not process expiration notifications
    expect(mockProcessMessageNotification).not.toHaveBeenCalled();
  });

  it('should skip non-created changeTypes', async () => {
    const notification = {
      value: [{
        subscriptionId: 'sub-123',
        changeType: 'updated', // Should be skipped
        resource: '/me/messages/msg-456'
      }]
    };

    const response = await request(app)
      .post('/api/microsoft-notify')
      .send(notification);

    expect(response.status).toBe(202);
    expect(mockProcessMessageNotification).not.toHaveBeenCalled();
  });

  it('should process notification with valid clientState', async () => {
    const notification = {
      value: [{
        subscriptionId: 'sub-123',
        changeType: 'created',
        resource: '/me/messages/msg-456',
        clientState: 'valid-signed-state'
      }]
    };
    mockVerifyClientState.mockReturnValue({ businessId: 1, emailAddress: 'test@example.com' });
    (query as any)
      .mockResolvedValueOnce({ rows: [] }) // isNotificationProcessed - not processed
      .mockResolvedValueOnce({ rows: [] }); // markNotificationProcessed

    await request(app)
      .post('/api/microsoft-notify')
      .send(notification);

    // Should verify clientState and process notification
    expect(mockVerifyClientState).toHaveBeenCalledWith('valid-signed-state');
    expect(mockProcessMessageNotification).toHaveBeenCalledWith(1, 1, 'test@example.com', 'msg-456');
  });

  it('should reject notification with invalid clientState', async () => {
    const notification = {
      value: [{
        subscriptionId: 'sub-123',
        changeType: 'created',
        resource: '/me/messages/msg-456',
        clientState: 'invalid-state'
      }]
    };
    mockVerifyClientState.mockReturnValue(null); // Invalid signature

    const response = await request(app)
      .post('/api/microsoft-notify')
      .send(notification);

    expect(response.status).toBe(202); // Still returns 202
    // Should not process invalid notifications
    expect(mockProcessMessageNotification).not.toHaveBeenCalled();
  });

  it('should fallback to subscription lookup when clientState missing', async () => {
    const notification = {
      value: [{
        subscriptionId: 'sub-123',
        changeType: 'created',
        resource: '/me/messages/msg-456'
        // No clientState
      }]
    };
    mockVerifyClientState.mockReturnValue(null);
    // Fallback lookup returns business/email
    (query as any)
      .mockResolvedValueOnce({ rows: [{ business_id: 1, email_address: 'test@example.com' }] }) // Subscription lookup
      .mockResolvedValueOnce({ rows: [] }) // isNotificationProcessed
      .mockResolvedValueOnce({ rows: [] }); // markNotificationProcessed

    await request(app)
      .post('/api/microsoft-notify')
      .send(notification);

    // Should use subscription lookup as fallback
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('microsoft_subscriptions'),
      ['sub-123']
    );
    expect(mockProcessMessageNotification).toHaveBeenCalled();
  });

  it('should skip already processed notifications (idempotency)', async () => {
    const notification = {
      value: [{
        subscriptionId: 'sub-123',
        changeType: 'created',
        resource: '/me/messages/msg-456',
        clientState: 'valid-state'
      }]
    };
    mockVerifyClientState.mockReturnValue({ businessId: 1, emailAddress: 'test@example.com' });
    // Notification already processed
    (query as any).mockResolvedValueOnce({ rows: [{ '1': 1 }] }); // Already processed

    await request(app)
      .post('/api/microsoft-notify')
      .send(notification);

    // Should not process again
    expect(mockProcessMessageNotification).not.toHaveBeenCalled();
  });

  it('should extract messageId from resource path', async () => {
    const notification = {
      value: [{
        subscriptionId: 'sub-123',
        changeType: 'created',
        resource: '/Users/user123/messages/msg-789', // Different format
        clientState: 'valid-state'
      }]
    };
    mockVerifyClientState.mockReturnValue({ businessId: 1, emailAddress: 'test@example.com' });
    (query as any)
      .mockResolvedValueOnce({ rows: [] }) // Not processed
      .mockResolvedValueOnce({ rows: [] }); // Mark processed

    await request(app)
      .post('/api/microsoft-notify')
      .send(notification);

    // Should extract messageId from /Users/{userId}/Messages/{messageId} format
    expect(mockProcessMessageNotification).toHaveBeenCalledWith(1, 1, 'test@example.com', 'msg-789');
  });

  it('should skip notification when messageId cannot be extracted', async () => {
    const notification = {
      value: [{
        subscriptionId: 'sub-123',
        changeType: 'created',
        resource: '/invalid/resource/path',
        clientState: 'valid-state'
      }]
    };
    mockVerifyClientState.mockReturnValue({ businessId: 1, emailAddress: 'test@example.com' });

    await request(app)
      .post('/api/microsoft-notify')
      .send(notification);

    // Should skip when messageId cannot be extracted
    expect(mockProcessMessageNotification).not.toHaveBeenCalled();
  });

  it('should unmark notification on retryable error', async () => {
    const notification = {
      value: [{
        subscriptionId: 'sub-123',
        changeType: 'created',
        resource: '/me/messages/msg-456',
        clientState: 'valid-state'
      }]
    };
    mockVerifyClientState.mockReturnValue({ businessId: 1, emailAddress: 'test@example.com' });
    const retryableError = new Error('Rate limit');
    mockIsRetryableGraphError.mockReturnValue(true);
    mockProcessMessageNotification.mockRejectedValueOnce(retryableError as never);
    (query as any)
      .mockResolvedValueOnce({ rows: [] }) // Not processed
      .mockResolvedValueOnce({ rows: [] }) // Mark processed
      .mockResolvedValueOnce({ rows: [] }); // Unmark processed

    await request(app)
      .post('/api/microsoft-notify')
      .send(notification);

    // Should unmark on retryable error so it can be retried
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM processed_emails'),
      expect.arrayContaining([1, 'test@example.com', 'sub-123', 'msg-456'])
    );
  });

  it('should handle invalid notification body gracefully', async () => {
    const response = await request(app)
      .post('/api/microsoft-notify')
      .send({ invalid: 'data' });

    // Should still return 202 even with invalid body
    expect(response.status).toBe(202);
  });

  it('should process multiple notifications in batch', async () => {
    const notification = {
      value: [
        {
          subscriptionId: 'sub-1',
          changeType: 'created',
          resource: '/me/messages/msg-1',
          clientState: 'valid-state-1'
        },
        {
          subscriptionId: 'sub-2',
          changeType: 'created',
          resource: '/me/messages/msg-2',
          clientState: 'valid-state-2'
        }
      ]
    };
    mockVerifyClientState
      .mockReturnValueOnce({ businessId: 1, emailAddress: 'test1@example.com' })
      .mockReturnValueOnce({ businessId: 1, emailAddress: 'test2@example.com' });
    mockFindMonitoredEmail
      .mockResolvedValueOnce({ id: 1, business_id: 1, email_address: 'test1@example.com' } as never)
      .mockResolvedValueOnce({ id: 2, business_id: 1, email_address: 'test2@example.com' } as never);
    (query as any).mockResolvedValue({ rows: [] }); // All not processed

    await request(app)
      .post('/api/microsoft-notify')
      .send(notification);

    // Should process both notifications
    expect(mockProcessMessageNotification).toHaveBeenCalledTimes(2);
  });

  it('should skip notification when monitored email not found', async () => {
    const notification = {
      value: [{
        subscriptionId: 'sub-123',
        changeType: 'created',
        resource: '/me/messages/msg-456',
        clientState: 'valid-state'
      }]
    };
    mockVerifyClientState.mockReturnValue({ businessId: 1, emailAddress: 'test@example.com' });
    mockFindMonitoredEmail.mockResolvedValue(null as never); // Not found
    (query as any).mockResolvedValueOnce({ rows: [] }); // Not processed

    await request(app)
      .post('/api/microsoft-notify')
      .send(notification);

    // Should not process when email not monitored
    expect(mockProcessMessageNotification).not.toHaveBeenCalled();
  });
});

