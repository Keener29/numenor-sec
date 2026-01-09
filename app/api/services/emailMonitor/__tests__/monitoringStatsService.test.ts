/**
 * MonitoringStatsService Tests
 * Tests monitoring statistics and status retrieval
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { MonitoringStatsService } from '../monitoringStatsService.js';

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

describe('MonitoringStatsService', () => {
  let service: MonitoringStatsService;

  beforeEach(() => {
    service = new MonitoringStatsService();
    jest.clearAllMocks();
  });

  describe('getMonitoringStatus', () => {
    it('should return event-driven monitoring status', () => {
      const status = service.getMonitoringStatus();

      expect(status).toEqual({
        isMonitoring: true,
        mode: 'event-driven'
      });
    });

    it('should always return isMonitoring as true', () => {
      const status = service.getMonitoringStatus();

      expect(status.isMonitoring).toBe(true);
      expect(status.mode).toBe('event-driven');
    });
  });

  describe('getMonitoringStats', () => {
    it('should return monitoring statistics successfully', async () => {
      // Mock email stats query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_emails: 10,
          connected_emails: 8,
          disconnected_emails: 2,
        }]
      });

      // Mock scan stats query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_scans: 100,
          successful_scans: 95,
          failed_scans: 5
        }]
      });

      const stats = await service.getMonitoringStats();

      expect(stats).toEqual({
        emails: {
          total_emails: 10,
          connected_emails: 8,
          disconnected_emails: 2,
        },
        scans: {
          total_scans: 100,
          successful_scans: 95,
          failed_scans: 5
        }
      });

      // Verify both queries were called
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should return default values when no data exists', async () => {
      // Mock empty email stats
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      // Mock empty scan stats
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const stats = await service.getMonitoringStats();

      expect(stats).toEqual({
        emails: {
          total_emails: 0,
          connected_emails: 0,
          disconnected_emails: 0,
        },
        scans: {
          total_scans: 0,
          successful_scans: 0,
          failed_scans: 0
        }
      });
    });

    it('should return default values when rows[0] is undefined', async () => {
      // Mock query returning empty rows array
      mockQuery.mockResolvedValueOnce({
        rows: []
      });
      mockQuery.mockResolvedValueOnce({
        rows: []
      });

      const stats = await service.getMonitoringStats();

      expect(stats.emails.total_emails).toBe(0);
      expect(stats.scans.total_scans).toBe(0);
    });

    it('should handle database errors gracefully and return defaults', async () => {
      const dbError = new Error('Database connection failed');
      mockQuery.mockRejectedValueOnce(dbError);

      const stats = await service.getMonitoringStats();

      // Should return default values instead of throwing
      expect(stats).toEqual({
        emails: {
          total_emails: 0,
          connected_emails: 0,
          disconnected_emails: 0,
        },
        scans: {
          total_scans: 0,
          successful_scans: 0,
          failed_scans: 0
        }
      });
    });

    it('should return defaults when any query fails', async () => {
      // Email stats succeed
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_emails: 5,
          connected_emails: 4,
          disconnected_emails: 1,
        }]
      });

      // Scan stats fail - this causes the entire try block to fail
      mockQuery.mockRejectedValueOnce(new Error('Scan stats query failed'));

      const stats = await service.getMonitoringStats();

      // When any query fails, the catch block returns defaults for everything
      expect(stats.emails.total_emails).toBe(0);
      expect(stats.scans.total_scans).toBe(0);
    });

    it('should handle null values in database results', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_emails: null,
          connected_emails: null,
          disconnected_emails: null
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_scans: null,
          successful_scans: null,
          failed_scans: null
        }]
      });

      const stats = await service.getMonitoringStats();

      // Should handle null values (TypeScript casting will handle this)
      expect(stats).toBeDefined();
    });
  });
});

