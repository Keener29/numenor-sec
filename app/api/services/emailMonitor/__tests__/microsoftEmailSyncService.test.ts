/**
 * MicrosoftEmailSyncService Tests
 * Tests Microsoft Graph email synchronization via notifications and fallback polling
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { MicrosoftEmailSyncService } from '../microsoftEmailSyncService.js';
import type { EmailMessage } from '../types.js';
import type { GraphMessage } from '../../oauth/outlook/types.js';

// Mock logger
jest.mock('../../../../utils/logger.js', () => ({
  monitoringLogger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock database connection
const mockQuery = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../../../db/connection.js', () => ({
  query: (...args: any[]) => mockQuery(...args)
}));

// Mock Outlook OAuth service
const mockRefreshTokenIfNeeded = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../oauth/outlook/OutlookOAuthService.js', () => ({
  outlookOAuthService: {
    refreshTokenIfNeeded: (...args: any[]) => mockRefreshTokenIfNeeded(...args)
  }
}));

// Mock MicrosoftGraphClient
const mockGraphClientInstance = {
  getMessage: jest.fn() as jest.MockedFunction<any>,
  listAllMessages: jest.fn() as jest.MockedFunction<any>
};
jest.mock('../../oauth/outlook/MicrosoftGraphClient.js', () => ({
  MicrosoftGraphClient: jest.fn().mockImplementation(() => mockGraphClientInstance)
}));

// Mock MicrosoftEmailAdapter
const mockParseGraphMessage = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../oauth/outlook/MicrosoftEmailAdapter.js', () => ({
  parseGraphMessage: (...args: any[]) => mockParseGraphMessage(...args)
}));

// Mock microsoftGraphErrorUtils
const mockIsRetryableGraphError = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../../utils/microsoftGraphErrorUtils.js', () => ({
  isRetryableGraphError: (...args: any[]) => mockIsRetryableGraphError(...args)
}));

// Mock processedEmailsService
const mockTryMarkAsProcessing = jest.fn() as jest.MockedFunction<any>;
const mockUnmarkMessageProcessed = jest.fn() as jest.MockedFunction<any>;
jest.mock('../processedEmailsService.js', () => ({
  processedEmailsService: {
    tryMarkAsProcessing: (...args: any[]) => mockTryMarkAsProcessing(...args),
    unmarkMessageProcessed: (...args: any[]) => mockUnmarkMessageProcessed(...args)
  }
}));

// Mock emailProcessor
const mockProcessEmailMessage = jest.fn() as jest.MockedFunction<any>;
jest.mock('../emailProcessor.js', () => ({
  emailProcessor: {
    processEmailMessage: (...args: any[]) => mockProcessEmailMessage(...args)
  }
}));

describe('MicrosoftEmailSyncService', () => {
  let service: MicrosoftEmailSyncService;
  let mockGraphMessage: GraphMessage;
  let mockEmailMessage: EmailMessage;

  beforeEach(() => {
    service = new MicrosoftEmailSyncService();
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockGraphMessage = {
      id: 'graph-msg-123',
      subject: 'Test Email',
      body: { content: 'Test body', contentType: 'html' },
      from: { emailAddress: { address: 'sender@example.com' } },
      receivedDateTime: new Date().toISOString()
    } as GraphMessage;

    mockEmailMessage = {
      id: 'graph-msg-123',
      subject: 'Test Email',
      body: 'Test body',
      sender: 'sender@example.com',
      recipient: 'recipient@example.com',
      timestamp: new Date(),
      attachments: [],
      links: [],
      headers: {}
    };

    // Reset default mocks
    mockRefreshTokenIfNeeded.mockResolvedValue({
      accessToken: 'token-123'
    });
    mockGraphClientInstance.getMessage.mockResolvedValue(mockGraphMessage);
    mockGraphClientInstance.listAllMessages.mockResolvedValue([]);
    mockParseGraphMessage.mockReturnValue(mockEmailMessage);
    mockTryMarkAsProcessing.mockResolvedValue(true);
    mockProcessEmailMessage.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('processMessageNotification', () => {
    it('should process message notification successfully', async () => {
      mockTryMarkAsProcessing.mockResolvedValueOnce(true);
      mockGraphClientInstance.getMessage.mockResolvedValueOnce(mockGraphMessage);
      mockParseGraphMessage.mockReturnValueOnce(mockEmailMessage);
      mockProcessEmailMessage.mockResolvedValueOnce(undefined);

      await service.processMessageNotification(1, 10, 'test@example.com', 'msg-123');

      expect(mockRefreshTokenIfNeeded).toHaveBeenCalledWith(1, 'test@example.com');
      expect(mockGraphClientInstance.getMessage).toHaveBeenCalledWith('msg-123', expect.any(Object));
      expect(mockParseGraphMessage).toHaveBeenCalledWith(mockGraphMessage, 'test@example.com');
      expect(mockProcessEmailMessage).toHaveBeenCalled();
    });

    it('should skip already processed messages', async () => {
      mockTryMarkAsProcessing.mockResolvedValueOnce(false); // Already processed

      await service.processMessageNotification(1, 10, 'test@example.com', 'msg-123');

      // Should return early without processing
      expect(mockGraphClientInstance.getMessage).not.toHaveBeenCalled();
      expect(mockProcessEmailMessage).not.toHaveBeenCalled();
    });

    it('should unmark message on processing failure', async () => {
      mockTryMarkAsProcessing.mockResolvedValueOnce(true);
      const processingError = new Error('Processing failed');
      mockGraphClientInstance.getMessage.mockRejectedValueOnce(processingError);
      mockUnmarkMessageProcessed.mockResolvedValueOnce(undefined);

      await expect(
        service.processMessageNotification(1, 10, 'test@example.com', 'msg-123')
      ).rejects.toThrow('Processing failed');

      expect(mockUnmarkMessageProcessed).toHaveBeenCalledWith(1, 'test@example.com', 'msg-123');
    });

    it('should propagate errors from refreshTokenIfNeeded', async () => {
      const tokenError = new Error('Token refresh failed');
      mockRefreshTokenIfNeeded.mockReset();
      mockRefreshTokenIfNeeded.mockRejectedValueOnce(tokenError);

      await expect(
        service.processMessageNotification(1, 10, 'test@example.com', 'msg-123')
      ).rejects.toThrow('Token refresh failed');
    });
  });

  describe('performFallbackPolling', () => {
    it('should perform fallback polling successfully', async () => {
      const lastChecked = new Date('2024-01-01T00:00:00Z');
      const messages = [mockGraphMessage];
      
      mockGraphClientInstance.listAllMessages.mockResolvedValueOnce(messages);

      await service.performFallbackPolling(1, 10, 'test@example.com', lastChecked);

      expect(mockGraphClientInstance.listAllMessages).toHaveBeenCalledWith(
        `receivedDateTime ge ${lastChecked.toISOString()}`,
        50,
        expect.any(Object)
      );
      expect(mockProcessEmailMessage).toHaveBeenCalled();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE monitored_emails'),
        [10]
      );
    });

    it('should perform fallback polling without lastChecked', async () => {
      const messages = [mockGraphMessage];
      mockGraphClientInstance.listAllMessages.mockResolvedValueOnce(messages);

      await service.performFallbackPolling(1, 10, 'test@example.com');

      // Should use empty filter when no lastChecked
      expect(mockGraphClientInstance.listAllMessages).toHaveBeenCalledWith(
        '',
        50,
        expect.any(Object)
      );
    });

    it('should return early when no messages found', async () => {
      mockGraphClientInstance.listAllMessages.mockResolvedValueOnce([]);

      await service.performFallbackPolling(1, 10, 'test@example.com');

      // Should return early without processing or updating last_checked
      expect(mockProcessEmailMessage).not.toHaveBeenCalled();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should process messages in batches', async () => {
      // Create 7 messages to test batching (batch size is 5)
      const messages = Array.from({ length: 7 }, (_, i) => ({
        ...mockGraphMessage,
        id: `msg-${i}`
      }));
      
      mockGraphClientInstance.listAllMessages.mockResolvedValueOnce(messages);

      await service.performFallbackPolling(1, 10, 'test@example.com');

      // Should process all 7 messages (2 batches: 5 + 2)
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(7);
    });

    it('should continue processing when some messages fail in batch', async () => {
      const messages = [
        { ...mockGraphMessage, id: 'msg-1' },
        { ...mockGraphMessage, id: 'msg-2' }
      ];
      
      mockGraphClientInstance.listAllMessages.mockResolvedValueOnce(messages);
      // First message fails, second succeeds
      mockProcessEmailMessage
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockResolvedValueOnce(undefined);

      await service.performFallbackPolling(1, 10, 'test@example.com');

      // Both messages should be attempted (Promise.allSettled continues on failure)
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(2);
    });

    it('should skip already processed messages in fallback polling', async () => {
      const messages = [
        { ...mockGraphMessage, id: 'msg-1' },
        { ...mockGraphMessage, id: 'msg-2' }
      ];
      
      mockGraphClientInstance.listAllMessages.mockResolvedValueOnce(messages);
      // First already processed, second can be processed
      mockTryMarkAsProcessing
        .mockResolvedValueOnce(false) // Already processed
        .mockResolvedValueOnce(true);  // Can process

      await service.performFallbackPolling(1, 10, 'test@example.com');

      // Only second message should be processed
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(1);
    });

    it('should propagate errors from listAllMessages', async () => {
      const listError = new Error('List messages failed');
      mockGraphClientInstance.listAllMessages.mockReset();
      mockGraphClientInstance.listAllMessages.mockRejectedValueOnce(listError);

      await expect(
        service.performFallbackPolling(1, 10, 'test@example.com')
      ).rejects.toThrow('List messages failed');
    });
  });

  describe('processFallbackPollingMessageWithRetry', () => {
    it('should retry on retryable errors with exponential backoff', async () => {
      const messages = [{ ...mockGraphMessage, id: 'msg-1' }];
      
      mockGraphClientInstance.listAllMessages.mockResolvedValueOnce(messages);
      
      // First attempt fails with retryable error, second succeeds
      const retryableError = new Error('Rate limit');
      mockIsRetryableGraphError.mockReturnValue(true);
      mockProcessEmailMessage
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce(undefined);

      // Advance timers to skip delay
      const promise = service.performFallbackPolling(1, 10, 'test@example.com');
      await jest.advanceTimersByTimeAsync(1000); // Advance past first retry delay
      await promise;

      // Should have retried (called twice)
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const messages = [{ ...mockGraphMessage, id: 'msg-1' }];
      
      mockGraphClientInstance.listAllMessages.mockResolvedValueOnce(messages);
      
      // Non-retryable error
      const nonRetryableError = new Error('Invalid request');
      mockIsRetryableGraphError.mockReturnValue(false);
      mockProcessEmailMessage.mockRejectedValueOnce(nonRetryableError);

      await service.performFallbackPolling(1, 10, 'test@example.com');

      // Should not retry (only called once)
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(1);
    });

    it('should stop retrying after max retries', async () => {
      const messages = [{ ...mockGraphMessage, id: 'msg-1' }];
      
      mockGraphClientInstance.listAllMessages.mockResolvedValueOnce(messages);
      
      // All attempts fail with retryable error
      const retryableError = new Error('Rate limit');
      mockIsRetryableGraphError.mockReturnValue(true);
      mockProcessEmailMessage.mockRejectedValue(retryableError);

      // Advance timers to skip delays
      const promise = service.performFallbackPolling(1, 10, 'test@example.com');
      await jest.advanceTimersByTimeAsync(30000); // Advance past all retry delays
      await promise;

      // Should have retried maxRetries times (default 3)
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(3);
    });

    it('should unmark message on processing failure', async () => {
      const messages = [{ ...mockGraphMessage, id: 'msg-1' }];
      
      mockGraphClientInstance.listAllMessages.mockResolvedValueOnce(messages);
      
      const processingError = new Error('Processing failed');
      mockIsRetryableGraphError.mockReturnValue(false); // Non-retryable
      mockProcessEmailMessage.mockRejectedValueOnce(processingError);

      await service.performFallbackPolling(1, 10, 'test@example.com');

      // Should unmark on failure
      expect(mockUnmarkMessageProcessed).toHaveBeenCalledWith(1, 'test@example.com', 'msg-1');
    });
  });
});

