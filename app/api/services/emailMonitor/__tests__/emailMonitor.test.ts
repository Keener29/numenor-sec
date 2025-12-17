/**
 * EmailMonitor Tests
 * Tests main email monitoring orchestrator
 */

import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { emailMonitor } from '../emailMonitor.js';

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

// Mock processedEmailsService
const mockPurgeProcessedEmails = jest.fn() as jest.MockedFunction<any>;
jest.mock('../processedEmailsService.js', () => ({
  processedEmailsService: {
    purgeProcessedEmails: (...args: any[]) => mockPurgeProcessedEmails(...args)
  }
}));

// Mock emailSyncService
const mockProcessNewEmailsFromHistory = jest.fn() as jest.MockedFunction<any>;
const mockPerformFullSyncFallback = jest.fn() as jest.MockedFunction<any>;
jest.mock('../emailSyncService.js', () => ({
  emailSyncService: {
    processNewEmailsFromHistory: (...args: any[]) => mockProcessNewEmailsFromHistory(...args),
    performFullSyncFallback: (...args: any[]) => mockPerformFullSyncFallback(...args)
  }
}));

// Mock monitoringStatsService
const mockGetMonitoringStatus = jest.fn() as jest.MockedFunction<any>;
const mockGetMonitoringStats = jest.fn() as jest.MockedFunction<any>;
jest.mock('../monitoringStatsService.js', () => ({
  monitoringStatsService: {
    getMonitoringStatus: (...args: any[]) => mockGetMonitoringStatus(...args),
    getMonitoringStats: (...args: any[]) => mockGetMonitoringStats(...args)
  }
}));

describe('EmailMonitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Clean up any intervals
    emailMonitor.stopMonitoring();
    jest.useRealTimers();
  });

  describe('initialize', () => {
    it('should initialize monitoring service and run initial purge', async () => {
      mockPurgeProcessedEmails.mockResolvedValueOnce(undefined);

      await emailMonitor.initialize();

      // Should run purge once at startup
      expect(mockPurgeProcessedEmails).toHaveBeenCalledTimes(1);
    });

    it('should schedule periodic purge every 12 hours', async () => {
      mockPurgeProcessedEmails.mockResolvedValue(undefined);

      await emailMonitor.initialize();

      // Advance time by 12 hours
      jest.advanceTimersByTime(12 * 60 * 60 * 1000);

      // Should have been called twice: once at init, once after 12 hours
      expect(mockPurgeProcessedEmails).toHaveBeenCalledTimes(2);
    });

    it('should handle initial purge failure gracefully', async () => {
      const purgeError = new Error('Purge failed');
      mockPurgeProcessedEmails.mockRejectedValueOnce(purgeError);

      // Should not throw - errors are logged but don't stop initialization
      await expect(emailMonitor.initialize()).resolves.not.toThrow();

      expect(mockPurgeProcessedEmails).toHaveBeenCalledTimes(1);
    });

    it('should handle periodic purge failures gracefully', async () => {
      mockPurgeProcessedEmails.mockResolvedValueOnce(undefined); // Initial purge succeeds
      mockPurgeProcessedEmails.mockRejectedValueOnce(new Error('Periodic purge failed'));

      await emailMonitor.initialize();

      // Advance time to trigger periodic purge
      jest.advanceTimersByTime(12 * 60 * 60 * 1000);

      // Should not throw - errors are logged but interval continues
      expect(mockPurgeProcessedEmails).toHaveBeenCalledTimes(2);
    });
  });

  describe('stopMonitoring', () => {
    it('should stop purge interval when called', async () => {
      mockPurgeProcessedEmails.mockResolvedValue(undefined);

      await emailMonitor.initialize();
      emailMonitor.stopMonitoring();

      // Advance time - purge should not run after stop
      jest.advanceTimersByTime(12 * 60 * 60 * 1000);

      // Should only have been called once (at initialization)
      expect(mockPurgeProcessedEmails).toHaveBeenCalledTimes(1);
    });

    it('should handle stopMonitoring when not initialized', () => {
      // Should not throw if called without initialization
      expect(() => emailMonitor.stopMonitoring()).not.toThrow();
    });

    it('should allow re-initialization after stop', async () => {
      mockPurgeProcessedEmails.mockResolvedValue(undefined);

      await emailMonitor.initialize();
      emailMonitor.stopMonitoring();
      await emailMonitor.initialize();

      // Should have been called twice (once per initialization)
      expect(mockPurgeProcessedEmails).toHaveBeenCalledTimes(2);
    });
  });

  describe('processNewEmailsFromHistory', () => {
    it('should delegate to emailSyncService', async () => {
      const latestHistoryId = 'history-456';
      mockProcessNewEmailsFromHistory.mockResolvedValueOnce(latestHistoryId);

      const result = await emailMonitor.processNewEmailsFromHistory(
        1,
        10,
        'test@example.com',
        'history-123',
        'history-456'
      );

      expect(result).toBe(latestHistoryId);
      expect(mockProcessNewEmailsFromHistory).toHaveBeenCalledWith(
        1,
        10,
        'test@example.com',
        'history-123',
        'history-456'
      );
    });

    it('should propagate errors from emailSyncService', async () => {
      const syncError = new Error('Sync failed');
      mockProcessNewEmailsFromHistory.mockRejectedValueOnce(syncError);

      await expect(
        emailMonitor.processNewEmailsFromHistory(1, 10, 'test@example.com', 'h1', 'h2')
      ).rejects.toThrow('Sync failed');
    });
  });

  describe('performFullSyncFallback', () => {
    it('should delegate to emailSyncService', async () => {
      mockPerformFullSyncFallback.mockResolvedValueOnce(undefined);

      await emailMonitor.performFullSyncFallback(1, 10, 'test@example.com');

      expect(mockPerformFullSyncFallback).toHaveBeenCalledWith(1, 10, 'test@example.com');
    });

    it('should propagate errors from emailSyncService', async () => {
      const syncError = new Error('Full sync failed');
      mockPerformFullSyncFallback.mockRejectedValueOnce(syncError);

      await expect(
        emailMonitor.performFullSyncFallback(1, 10, 'test@example.com')
      ).rejects.toThrow('Full sync failed');
    });
  });

  describe('getMonitoringStatus', () => {
    it('should delegate to monitoringStatsService', () => {
      const status = { isMonitoring: true, mode: 'event-driven' };
      mockGetMonitoringStatus.mockReturnValueOnce(status);

      const result = emailMonitor.getMonitoringStatus();

      expect(result).toEqual(status);
      expect(mockGetMonitoringStatus).toHaveBeenCalled();
    });
  });

  describe('getMonitoringStats', () => {
    it('should delegate to monitoringStatsService', async () => {
      const stats = {
        emails: { total_emails: 10, connected_emails: 8 },
        scans: { total_scans: 100 }
      };
      mockGetMonitoringStats.mockResolvedValueOnce(stats);

      const result = await emailMonitor.getMonitoringStats();

      expect(result).toEqual(stats);
      expect(mockGetMonitoringStats).toHaveBeenCalled();
    });

    it('should propagate errors from monitoringStatsService', async () => {
      const statsError = new Error('Stats failed');
      mockGetMonitoringStats.mockRejectedValueOnce(statsError);

      await expect(emailMonitor.getMonitoringStats()).rejects.toThrow('Stats failed');
    });
  });

  describe('triggerBusinessScan', () => {
    it('should scan all connected emails for a business', async () => {
      // Mock query to return business emails
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, business_id: 100, email_address: 'email1@example.com' },
          { id: 2, business_id: 100, email_address: 'email2@example.com' }
        ]
      });
      mockPerformFullSyncFallback.mockResolvedValue(undefined);

      await emailMonitor.triggerBusinessScan(100);

      // Should call full sync for each email
      expect(mockPerformFullSyncFallback).toHaveBeenCalledTimes(2);
      expect(mockPerformFullSyncFallback).toHaveBeenCalledWith(100, 1, 'email1@example.com');
      expect(mockPerformFullSyncFallback).toHaveBeenCalledWith(100, 2, 'email2@example.com');
    });

    it('should return early when no connected emails found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [] // No emails found
      });

      await emailMonitor.triggerBusinessScan(100);

      // Should not call sync service
      expect(mockPerformFullSyncFallback).not.toHaveBeenCalled();
    });

    it('should only scan emails with OAuth tokens (connected)', async () => {
      // Query joins monitored_emails with oauth_tokens, so only connected emails are returned
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, business_id: 100, email_address: 'connected@example.com' }
        ]
      });
      mockPerformFullSyncFallback.mockResolvedValue(undefined);

      await emailMonitor.triggerBusinessScan(100);

      expect(mockPerformFullSyncFallback).toHaveBeenCalledTimes(1);
      expect(mockPerformFullSyncFallback).toHaveBeenCalledWith(
        100,
        1,
        'connected@example.com'
      );
    });

    it('should handle errors during business scan', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, business_id: 100, email_address: 'email1@example.com' },
          { id: 2, business_id: 100, email_address: 'email2@example.com' }
        ]
      });
      // First sync succeeds, second fails
      mockPerformFullSyncFallback
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Sync failed'));

      await expect(emailMonitor.triggerBusinessScan(100)).rejects.toThrow('Sync failed');

      // Should have attempted both syncs
      expect(mockPerformFullSyncFallback).toHaveBeenCalledTimes(2);
    });

    it('should handle database query errors', async () => {
      const dbError = new Error('Database query failed');
      mockQuery.mockRejectedValueOnce(dbError);

      await expect(emailMonitor.triggerBusinessScan(100)).rejects.toThrow('Database query failed');

      expect(mockPerformFullSyncFallback).not.toHaveBeenCalled();
    });

    it('should process emails sequentially', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, business_id: 100, email_address: 'email1@example.com' },
          { id: 2, business_id: 100, email_address: 'email2@example.com' },
          { id: 3, business_id: 100, email_address: 'email3@example.com' }
        ]
      });
      mockPerformFullSyncFallback.mockResolvedValue(undefined);

      await emailMonitor.triggerBusinessScan(100);

      // Verify all three emails were processed
      expect(mockPerformFullSyncFallback).toHaveBeenCalledTimes(3);
    });
  });
});

