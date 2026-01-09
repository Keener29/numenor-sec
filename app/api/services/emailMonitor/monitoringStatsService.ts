import { query } from '../../../db/connection.js';
import { monitoringLogger } from '../../../utils/logger.js';

/**
 * Service for monitoring statistics and status
 */
export class MonitoringStatsService {
  /**
   * Get monitoring status (event-driven, no polling)
   */
  getMonitoringStatus(): { isMonitoring: boolean; mode: string } {
    return {
      isMonitoring: true, // Always active in event-driven mode
      mode: 'event-driven'
    };
  }

  /**
   * Get monitoring statistics
   */
  async getMonitoringStats(): Promise<any> {
    try {
      const stats = await query(
        `SELECT 
          COUNT(*) as total_emails,
          COUNT(CASE WHEN ot.id IS NOT NULL THEN 1 END) as connected_emails,
          COUNT(CASE WHEN ot.id IS NULL THEN 1 END) as disconnected_emails
         FROM monitored_emails me
         LEFT JOIN oauth_tokens ot ON me.business_id = ot.business_id AND me.email_address = ot.email_address`,
        []
      );

      const scanStats = await query(
        `SELECT 
          COUNT(*) as total_scans,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_scans,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_scans
         FROM email_scans 
         WHERE created_at > NOW() - INTERVAL '24 hours'`,
        []
      );

      // Handle empty data gracefully
      const emailStats = (stats.rows[0] as { total_emails: number; connected_emails: number; disconnected_emails: number }) || {
        total_emails: 0,
        connected_emails: 0,
        disconnected_emails: 0
      };

      const scanStatsData = (scanStats.rows[0] as { total_scans: number; successful_scans: number; failed_scans: number }) || {
        total_scans: 0,
        successful_scans: 0,
        failed_scans: 0
      };

      return {
        emails: emailStats,
        scans: scanStatsData
      };
    } catch (error) {
      monitoringLogger.error('Failed to get monitoring stats', {
        operation: 'get-monitoring-stats'
      }, error instanceof Error ? error : new Error(String(error)));
      // Return default values instead of throwing
      return {
        emails: {
          total_emails: 0,
          connected_emails: 0,
          disconnected_emails: 0
        },
        scans: {
          total_scans: 0,
          successful_scans: 0,
          failed_scans: 0
        }
      };
    }
  }
}

export const monitoringStatsService = new MonitoringStatsService();
