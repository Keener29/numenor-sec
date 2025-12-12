import { query } from '../../db/connection.js';
import { logger } from '../../utils/logger.js';

/**
 * Log security events to the database
 * This service can be used across the application for security event tracking
 */
export class SecurityEventLogger {
  /**
   * Log security event
   */
  async logSecurityEvent(
    businessId: number,
    eventType: string,
    description: string,
    metadata?: any
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO security_events (business_id, event_type, description, metadata, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [businessId, eventType, description, metadata ? JSON.stringify(metadata) : null]
      );
    } catch (error) {
      logger.error('Failed to log security event', {
        operation: 'log-security-event',
        metadata: {
          businessId,
          eventType
        }
      }, error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const securityEventLogger = new SecurityEventLogger();
