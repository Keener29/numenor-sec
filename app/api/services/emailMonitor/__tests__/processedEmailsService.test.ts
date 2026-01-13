/**
 * ProcessedEmailsService Tests
 * Tests deduplication and processed emails management
 */

import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { ProcessedEmailsService } from '../processedEmailsService.js';

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

describe('ProcessedEmailsService', () => {
  let service: ProcessedEmailsService;
  const originalEnv = process.env;

  beforeEach(() => {
    service = new ProcessedEmailsService();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('tryMarkAsProcessing', () => {
    it('should return true when successfully marking message as processing', async () => {
      // Mock successful insert (message not already processed)
      mockQuery.mockResolvedValueOnce({
        rows: [{ '1': 1 }] // Return row indicates successful insert
      });

      const result = await service.tryMarkAsProcessing(1, 'test@example.com', 'sub-123', 'msg-123');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO processed_emails'),
        [1, 'test@example.com', 'sub-123', 'msg-123']
      );
    });

    it('should return false when message is already processed (conflict)', async () => {
      // Mock conflict - no rows returned (ON CONFLICT DO NOTHING)
      mockQuery.mockResolvedValueOnce({
        rows: [] // Empty rows means conflict occurred
      });

      const result = await service.tryMarkAsProcessing(1, 'test@example.com', 'sub-123', 'msg-123');

      expect(result).toBe(false);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO processed_emails'),
        [1, 'test@example.com', 'sub-123', 'msg-123']
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockQuery.mockRejectedValueOnce(dbError);

      await expect(
        service.tryMarkAsProcessing(1, 'test@example.com', 'sub-123', 'msg-123')
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('isMessageProcessed', () => {
    it('should return true when message is already processed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ '1': 1 }] // Row exists = message processed
      });

      const result = await service.isMessageProcessed(1, 'test@example.com', 'sub-123', 'msg-123');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT 1 FROM processed_emails WHERE business_id = $1 AND email_address = $2 AND subscription_id = $3 AND message_id = $4',
        [1, 'test@example.com', 'sub-123', 'msg-123']
      );
    });

    it('should return false when message is not processed', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [] // No rows = message not processed
      });

      const result = await service.isMessageProcessed(1, 'test@example.com', 'sub-123', 'msg-123');

      expect(result).toBe(false);
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database error');
      mockQuery.mockRejectedValueOnce(dbError);

      await expect(
        service.isMessageProcessed(1, 'test@example.com', 'sub-123', 'msg-123')
      ).rejects.toThrow('Database error');
    });
  });

  describe('unmarkMessageProcessed', () => {
    it('should delete processed email record', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      await service.unmarkMessageProcessed(1, 'test@example.com', 'sub-123', 'msg-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM processed_emails'),
        [1, 'test@example.com', 'sub-123', 'msg-123']
      );
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Delete failed');
      mockQuery.mockRejectedValueOnce(dbError);

      await expect(
        service.unmarkMessageProcessed(1, 'test@example.com', 'sub-123', 'msg-123')
      ).rejects.toThrow('Delete failed');
    });
  });

  describe('getProcessedRetentionHours', () => {
    it('should return default 48 hours when env var is not set', () => {
      delete process.env.PROCESSED_EMAIL_RETENTION_HOURS;

      const result = service.getProcessedRetentionHours();

      expect(result).toBe(48);
    });

    it('should return valid retention hours from env var', () => {
      process.env.PROCESSED_EMAIL_RETENTION_HOURS = '36';

      const result = service.getProcessedRetentionHours();

      expect(result).toBe(36);
    });

    it('should return default when env var is below minimum (24)', () => {
      process.env.PROCESSED_EMAIL_RETENTION_HOURS = '12';

      const result = service.getProcessedRetentionHours();

      expect(result).toBe(48); // Default fallback
    });

    it('should return default when env var is above maximum (48)', () => {
      process.env.PROCESSED_EMAIL_RETENTION_HOURS = '72';

      const result = service.getProcessedRetentionHours();

      expect(result).toBe(48); // Default fallback
    });

    it('should return default when env var is not a number', () => {
      process.env.PROCESSED_EMAIL_RETENTION_HOURS = 'invalid';

      const result = service.getProcessedRetentionHours();

      expect(result).toBe(48); // Default fallback
    });

    it('should accept boundary values (24 and 48)', () => {
      process.env.PROCESSED_EMAIL_RETENTION_HOURS = '24';
      expect(service.getProcessedRetentionHours()).toBe(24);

      process.env.PROCESSED_EMAIL_RETENTION_HOURS = '48';
      expect(service.getProcessedRetentionHours()).toBe(48);
    });
  });

  describe('purgeProcessedEmails', () => {
    it('should purge old processed emails using retention hours', async () => {
      process.env.PROCESSED_EMAIL_RETENTION_HOURS = '36';
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      await service.purgeProcessedEmails();

      // Verify DELETE query was called with correct interval
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM processed_emails'),
        ['36 hours']
      );
    });

    it('should use default retention hours when env var not set', async () => {
      delete process.env.PROCESSED_EMAIL_RETENTION_HOURS;
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      await service.purgeProcessedEmails();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM processed_emails'),
        ['48 hours'] // Default
      );
    });

    it('should handle database errors during purge', async () => {
      const dbError = new Error('Purge failed');
      mockQuery.mockRejectedValueOnce(dbError);

      await expect(service.purgeProcessedEmails()).rejects.toThrow('Purge failed');
    });
  });
});

