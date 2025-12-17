/**
 * EmailSyncService Tests
 * Tests Gmail email synchronization via history API and full sync fallback
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { EmailSyncService } from '../emailSyncService.js';
import type { EmailMessage } from '../types.js';

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

// Mock Gmail OAuth service
const mockListHistorySince = jest.fn() as jest.MockedFunction<any>;
const mockGetMessagesByIds = jest.fn() as jest.MockedFunction<any>;
const mockFetchEmails = jest.fn() as jest.MockedFunction<any>;
jest.mock('../../oauth/gmail/GmailOAuthService.js', () => ({
  gmailOAuthService: {
    listHistorySince: (...args: any[]) => mockListHistorySince(...args),
    getMessagesByIds: (...args: any[]) => mockGetMessagesByIds(...args),
    fetchEmails: (...args: any[]) => mockFetchEmails(...args)
  }
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

describe('EmailSyncService', () => {
  let service: EmailSyncService;
  let mockEmailMessage: EmailMessage;

  beforeEach(() => {
    service = new EmailSyncService();
    jest.clearAllMocks();

    mockEmailMessage = {
      id: 'msg-123',
      subject: 'Test Email',
      body: 'Test body',
      sender: 'sender@example.com',
      recipient: 'recipient@example.com',
      timestamp: new Date(),
      attachments: [],
      links: [],
      headers: {}
    };
  });

  describe('processNewEmailsFromHistory', () => {
    it('should process new emails from history successfully', async () => {
      const messageIds = ['msg-1', 'msg-2'];
      const latestHistoryId = 'history-456';
      
      mockListHistorySince.mockResolvedValueOnce({
        messageIds,
        latestHistoryId
      });
      mockGetMessagesByIds.mockResolvedValueOnce([
        { ...mockEmailMessage, id: 'msg-1' },
        { ...mockEmailMessage, id: 'msg-2' }
      ]);
      mockTryMarkAsProcessing.mockResolvedValue(true); // All messages can be processed
      mockProcessEmailMessage.mockResolvedValue(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Scan record insert

      const result = await service.processNewEmailsFromHistory(
        1,
        10,
        'test@example.com',
        'history-123',
        'history-456'
      );

      expect(result).toBe(latestHistoryId);
      expect(mockListHistorySince).toHaveBeenCalledWith(1, 'test@example.com', 'history-123');
      expect(mockGetMessagesByIds).toHaveBeenCalledWith(1, 'test@example.com', messageIds);
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO email_scans'),
        expect.arrayContaining([1, 10, 'real_time', 0, 2]) // businessId, emailId, scan_type, threats_found, emails_processed
      );
    });

    it('should return latestHistoryId when no new messages found', async () => {
      const latestHistoryId = 'history-456';
      mockListHistorySince.mockResolvedValueOnce({
        messageIds: [],
        latestHistoryId
      });

      const result = await service.processNewEmailsFromHistory(
        1,
        10,
        'test@example.com',
        'history-123',
        'history-456'
      );

      expect(result).toBe(latestHistoryId);
      expect(mockGetMessagesByIds).not.toHaveBeenCalled();
      expect(mockProcessEmailMessage).not.toHaveBeenCalled();
    });

    it('should skip already processed messages', async () => {
      mockListHistorySince.mockResolvedValueOnce({
        messageIds: ['msg-1', 'msg-2'],
        latestHistoryId: 'history-456'
      });
      mockGetMessagesByIds.mockResolvedValueOnce([
        { ...mockEmailMessage, id: 'msg-1' },
        { ...mockEmailMessage, id: 'msg-2' }
      ]);
      // First message already processed, second can be processed
      mockTryMarkAsProcessing
        .mockResolvedValueOnce(false) // Already processed
        .mockResolvedValueOnce(true);  // Can process
      mockProcessEmailMessage.mockResolvedValue(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.processNewEmailsFromHistory(1, 10, 'test@example.com', 'h1', 'h2');

      // Only second message should be processed
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([0, 1]) // threats_found: 0, emails_processed: 1
      );
    });

    it('should unmark message on processing failure and continue', async () => {
      mockListHistorySince.mockResolvedValueOnce({
        messageIds: ['msg-1', 'msg-2'],
        latestHistoryId: 'history-456'
      });
      mockGetMessagesByIds.mockResolvedValueOnce([
        { ...mockEmailMessage, id: 'msg-1' },
        { ...mockEmailMessage, id: 'msg-2' }
      ]);
      mockTryMarkAsProcessing.mockResolvedValue(true);
      // First message fails, second succeeds
      mockProcessEmailMessage
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockResolvedValueOnce(undefined);
      mockUnmarkMessageProcessed.mockResolvedValue(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.processNewEmailsFromHistory(1, 10, 'test@example.com', 'h1', 'h2');

      // Should unmark failed message and continue with second
      expect(mockUnmarkMessageProcessed).toHaveBeenCalledWith(1, 'test@example.com', 'msg-1');
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([0, 1]) // Only one email processed successfully
      );
    });

    it('should propagate errors from listHistorySince', async () => {
      const historyError = new Error('History API failed');
      mockListHistorySince.mockRejectedValueOnce(historyError);

      await expect(
        service.processNewEmailsFromHistory(1, 10, 'test@example.com', 'h1', 'h2')
      ).rejects.toThrow('History API failed');
    });

    it('should propagate errors from getMessagesByIds', async () => {
      mockListHistorySince.mockResolvedValueOnce({
        messageIds: ['msg-1'],
        latestHistoryId: 'history-456'
      });
      const messagesError = new Error('Get messages failed');
      mockGetMessagesByIds.mockRejectedValueOnce(messagesError);

      await expect(
        service.processNewEmailsFromHistory(1, 10, 'test@example.com', 'h1', 'h2')
      ).rejects.toThrow('Get messages failed');
    });
  });

  describe('performFullSyncFallback', () => {
    it('should perform full sync fallback successfully', async () => {
      const connectionDate = new Date('2024-01-01T00:00:00Z');
      const connectionTimestampWithBuffer = new Date(connectionDate.getTime() - 1000);
      
      mockQuery.mockResolvedValueOnce({
        rows: [{ created_at: connectionDate }]
      });
      
      const messages = [
        {
          ...mockEmailMessage,
          id: 'msg-1',
          timestamp: new Date('2024-01-01T01:00:00Z'),
          labels: ['INBOX']
        },
        {
          ...mockEmailMessage,
          id: 'msg-2',
          timestamp: new Date('2024-01-01T02:00:00Z'),
          labels: ['INBOX']
        }
      ];
      mockFetchEmails.mockResolvedValueOnce(messages);
      mockTryMarkAsProcessing.mockResolvedValue(true);
      mockProcessEmailMessage.mockResolvedValue(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Scan record insert

      await service.performFullSyncFallback(1, 10, 'test@example.com');

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT created_at FROM oauth_tokens WHERE business_id = $1 AND email_address = $2',
        [1, 'test@example.com']
      );
      expect(mockFetchEmails).toHaveBeenCalledWith(
        1,
        'test@example.com',
        50,
        '',
        connectionTimestampWithBuffer
      );
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO email_scans'),
        expect.arrayContaining([1, 10, 'full_scan', 0, 2])
      );
    });

    it('should filter out sent/draft/trash emails', async () => {
      const connectionDate = new Date('2024-01-01T00:00:00Z');
      mockQuery.mockResolvedValueOnce({
        rows: [{ created_at: connectionDate }]
      });

      const messages = [
        {
          ...mockEmailMessage,
          id: 'msg-1',
          timestamp: new Date('2024-01-01T01:00:00Z'),
          labels: ['SENT'] // Should be filtered
        },
        {
          ...mockEmailMessage,
          id: 'msg-2',
          timestamp: new Date('2024-01-01T02:00:00Z'),
          labels: ['DRAFT'] // Should be filtered
        },
        {
          ...mockEmailMessage,
          id: 'msg-3',
          timestamp: new Date('2024-01-01T03:00:00Z'),
          labels: ['INBOX'] // Should be processed
        }
      ];
      mockFetchEmails.mockResolvedValueOnce(messages);
      mockTryMarkAsProcessing.mockResolvedValue(true);
      mockProcessEmailMessage.mockResolvedValue(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.performFullSyncFallback(1, 10, 'test@example.com');

      // Only INBOX message should be processed
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([0, 1]) // Only one email processed
      );
    });

    it('should filter out emails from self', async () => {
      const connectionDate = new Date('2024-01-01T00:00:00Z');
      mockQuery.mockResolvedValueOnce({
        rows: [{ created_at: connectionDate }]
      });

      const messages = [
        {
          ...mockEmailMessage,
          id: 'msg-1',
          sender: 'test@example.com', // Self - should be filtered
          timestamp: new Date('2024-01-01T01:00:00Z'),
          labels: ['INBOX']
        },
        {
          ...mockEmailMessage,
          id: 'msg-2',
          sender: 'other@example.com', // Should be processed
          timestamp: new Date('2024-01-01T02:00:00Z'),
          labels: ['INBOX']
        }
      ];
      mockFetchEmails.mockResolvedValueOnce(messages);
      mockTryMarkAsProcessing.mockResolvedValue(true);
      mockProcessEmailMessage.mockResolvedValue(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.performFullSyncFallback(1, 10, 'test@example.com');

      // Only non-self message should be processed
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(1);
    });

    it('should filter out emails before connection timestamp', async () => {
      const connectionDate = new Date('2024-01-01T12:00:00Z');
      const connectionTimestampWithBuffer = new Date(connectionDate.getTime() - 1000);
      mockQuery.mockResolvedValueOnce({
        rows: [{ created_at: connectionDate }]
      });

      const messages = [
        {
          ...mockEmailMessage,
          id: 'msg-1',
          timestamp: new Date('2024-01-01T11:59:00Z'), // Before connection - filtered
          labels: ['INBOX']
        },
        {
          ...mockEmailMessage,
          id: 'msg-2',
          timestamp: connectionTimestampWithBuffer, // At buffer time - should be processed
          labels: ['INBOX']
        }
      ];
      mockFetchEmails.mockResolvedValueOnce(messages);
      mockTryMarkAsProcessing.mockResolvedValue(true);
      mockProcessEmailMessage.mockResolvedValue(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.performFullSyncFallback(1, 10, 'test@example.com');

      // Only message at/after buffer should be processed
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle string timestamp from database', async () => {
      const connectionDateString = '2024-01-01T00:00:00Z';
      mockQuery.mockResolvedValueOnce({
        rows: [{ created_at: connectionDateString }] // String instead of Date
      });

      const messages = [
        {
          ...mockEmailMessage,
          id: 'msg-1',
          timestamp: new Date('2024-01-01T01:00:00Z'),
          labels: ['INBOX']
        }
      ];
      mockFetchEmails.mockResolvedValueOnce(messages);
      mockTryMarkAsProcessing.mockResolvedValue(true);
      mockProcessEmailMessage.mockResolvedValue(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.performFullSyncFallback(1, 10, 'test@example.com');

      // Should convert string to Date and process correctly
      expect(mockFetchEmails).toHaveBeenCalled();
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(1);
    });

    it('should throw error when no OAuth tokens found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [] // No tokens found
      });

      await expect(
        service.performFullSyncFallback(1, 10, 'test@example.com')
      ).rejects.toThrow('No OAuth tokens found for email');
    });

    it('should unmark message on processing failure and continue', async () => {
      const connectionDate = new Date('2024-01-01T00:00:00Z');
      mockQuery.mockResolvedValueOnce({
        rows: [{ created_at: connectionDate }]
      });

      const messages = [
        { ...mockEmailMessage, id: 'msg-1', timestamp: new Date('2024-01-01T01:00:00Z'), labels: ['INBOX'] },
        { ...mockEmailMessage, id: 'msg-2', timestamp: new Date('2024-01-01T02:00:00Z'), labels: ['INBOX'] }
      ];
      mockFetchEmails.mockResolvedValueOnce(messages);
      mockTryMarkAsProcessing.mockResolvedValue(true);
      mockProcessEmailMessage
        .mockRejectedValueOnce(new Error('Processing failed'))
        .mockResolvedValueOnce(undefined);
      mockUnmarkMessageProcessed.mockResolvedValue(undefined);
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.performFullSyncFallback(1, 10, 'test@example.com');

      expect(mockUnmarkMessageProcessed).toHaveBeenCalledWith(1, 'test@example.com', 'msg-1');
      expect(mockProcessEmailMessage).toHaveBeenCalledTimes(2);
    });

    it('should propagate errors from fetchEmails', async () => {
      const connectionDate = new Date('2024-01-01T00:00:00Z');
      mockQuery.mockResolvedValueOnce({
        rows: [{ created_at: connectionDate }]
      });
      const fetchError = new Error('Fetch emails failed');
      mockFetchEmails.mockRejectedValueOnce(fetchError);

      await expect(
        service.performFullSyncFallback(1, 10, 'test@example.com')
      ).rejects.toThrow('Fetch emails failed');
    });
  });
});

