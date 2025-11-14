import { Router } from 'express';
import { authenticateToken, requireBusiness, type AuthRequest } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validation.js';
import { phishingDetector } from '../services/detector/phishingDetector.js';
import { emailMonitor } from '../services/emailMonitor.js';
import { query } from '../../db/connection.js';
import { securityLogger } from '../services/logger.js';
import { phishingStatisticsQuerySchema, phishingPatternsQuerySchema } from '../schemas/phishing.js';
import { z } from 'zod';


const router = Router();


// Schema for manual scan request
const manualScanSchema = z.object({
  emailId: z.number().int().positive('Valid email ID is required').optional(),
  businessId: z.number().int().positive('Valid business ID is required').optional()
});


/**
 * @route POST /api/phishing/scan
 * @desc Manually trigger email scan for business or specific email
 * @access Private (Business users only)
 */
router.post('/scan', authenticateToken, requireBusiness, validateBody(manualScanSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const { emailId, businessId: targetBusinessId } = req.body;

    // Ensure user can only scan their own business
    const scanBusinessId = targetBusinessId || businessId;
    if (scanBusinessId !== businessId) {
      return res.status(403).json({ error: 'Access denied. You can only scan your own business emails.' });
    }

    if (emailId) {
      // Scan specific email - only if it has OAuth tokens (is connected)
      const emailResult = await query(
        `SELECT me.id, me.business_id, me.email_address 
         FROM monitored_emails me
         INNER JOIN oauth_tokens ot ON me.business_id = ot.business_id AND me.email_address = ot.email_address
         WHERE me.id = $1 AND me.business_id = $2`,
        [emailId, businessId]
      );

      if (emailResult.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Email not found, access denied, or email is not connected via OAuth. Please connect the email first.' 
        });
      }

      const email = emailResult.rows[0] as { id: number; email_address: string };
      securityLogger.info('Manual scan triggered for connected email', {
        operation: 'manual-scan-email',
        businessId,
        metadata: {
          emailId: email.id,
          emailAddress: email.email_address
        }
      });

      // Trigger scan for specific email
      await emailMonitor.triggerBusinessScan(businessId);

      res.json({
        success: true,
        message: `Manual scan triggered for email: ${email.email_address}`,
        emailId: email.id
      });

    } else {
      // Scan all business emails
      securityLogger.info('Manual scan triggered for business', {
        operation: 'manual-scan-business',
        businessId
      });

      await emailMonitor.triggerBusinessScan(businessId);

      res.json({
        success: true,
        message: `Manual scan triggered for all business emails`,
        businessId
      });
    }

  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/phishing/statistics
 * @desc Get phishing threat statistics for business
 * @access Private (Business users only)
 */
router.get('/statistics', authenticateToken, requireBusiness, validateQuery(phishingStatisticsQuerySchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const days = (req.query.days as unknown as number) || 30;

    securityLogger.info('Getting threat statistics for business', {
      operation: 'get-threat-statistics',
      businessId
    });

    // Get threat statistics (will return empty array if no data)
    let threatStats = [];
    try {
      threatStats = await phishingDetector.getThreatStatistics(businessId, days);
    } catch (error) {
      securityLogger.error('Error getting threat statistics', {
        operation: 'get-threat-statistics',
        businessId
      }, error as Error);
      threatStats = [];
    }

    // Get monitoring statistics (will return default values if no data)
    let monitoringStats = null;
    try {
      monitoringStats = await emailMonitor.getMonitoringStats();
    } catch (error) {
      securityLogger.error('Error getting monitoring stats', {
        operation: 'get-monitoring-stats',
        businessId
      }, error as Error);
      monitoringStats = {
        emails: {
          total_emails: 0,
          connected_emails: 0,
          disconnected_emails: 0,
          recently_checked: 0
        },
        scans: {
          total_scans: 0,
          successful_scans: 0,
          failed_scans: 0,
          avg_emails_per_scan: 0
        }
      };
    }

    // Get recent alerts (will return empty array if no data)
    let recentAlerts: { rows: unknown[] } = { rows: [] };
    try {
      recentAlerts = await query(
        `SELECT 
          pa.id,
          pa.threat_level,
          pa.status,
          pa.created_at,
          me.email_address,
          pa.subject,
          pa.sender_email
        FROM phishing_alerts pa
        JOIN monitored_emails me ON pa.email_id = me.id
        WHERE pa.business_id = $1
        ORDER BY pa.created_at DESC
        LIMIT 10`,
        [businessId]
      );
    } catch (error) {
      securityLogger.error('Error getting recent alerts', {
        operation: 'get-recent-alerts',
        businessId
      }, error as Error);
      recentAlerts = { rows: [] };
    }

    // Calculate summary statistics (handle empty data gracefully)
    // Only count actual threats (critical, high, medium) - ignore low and safe
    const threatStatsFiltered = threatStats?.filter((stat: { threat_level: string }) => 
      ['critical', 'high', 'medium'].includes(stat.threat_level)
    ) || [];
    
    const recentAlertsFiltered = recentAlerts.rows?.filter((alert) => {
      const typedAlert = alert as { threat_level: string };
      return ['critical', 'high', 'medium'].includes(typedAlert.threat_level);
    }) || [];

    const summary = {
      totalAlerts: threatStatsFiltered.length,
      criticalAlerts: threatStats?.filter((stat: { threat_level: string }) => stat.threat_level === 'critical').length || 0,
      highAlerts: threatStats?.filter((stat: { threat_level: string }) => stat.threat_level === 'high').length || 0,
      mediumAlerts: threatStats?.filter((stat: { threat_level: string }) => stat.threat_level === 'medium').length || 0,
      pendingAlerts: recentAlertsFiltered.filter((alert) => {
        const typedAlert = alert as { status: string };
        return typedAlert.status === 'pending';
      }).length
    };

    res.json({
      success: true,
      statistics: {
        summary,
        threatBreakdown: threatStatsFiltered,
        recentAlerts: recentAlertsFiltered,
        monitoring: monitoringStats || {
          emails: {
            total_emails: 0,
            connected_emails: 0,
            disconnected_emails: 0,
            recently_checked: 0
          },
          scans: {
            total_scans: 0,
            successful_scans: 0,
            failed_scans: 0,
            avg_emails_per_scan: 0
          }
        }
      }
    });

  } catch (error) {
    securityLogger.error('Error in statistics endpoint', {
      operation: 'get-threat-statistics'
    }, error as Error);
    // Return default data instead of error
    res.json({
      success: true,
      statistics: {
        summary: {
          totalAlerts: 0,
          criticalAlerts: 0,
          highAlerts: 0,
          mediumAlerts: 0,
          pendingAlerts: 0
        },
        threatBreakdown: [],
        recentAlerts: [],
        monitoring: {
          emails: {
            total_emails: 0,
            connected_emails: 0,
            disconnected_emails: 0,
            recently_checked: 0
          },
          scans: {
            total_scans: 0,
            successful_scans: 0,
            failed_scans: 0,
            avg_emails_per_scan: 0
          }
        }
      }
    });
  }
});

/**
 * @route GET /api/phishing/patterns
 * @desc Get detected phishing patterns and their descriptions
 * @access Private (Business users only)
 */
router.get('/patterns', authenticateToken, validateQuery(phishingPatternsQuerySchema), async (req: AuthRequest, res, next) => {
  try {
    // Get pattern statistics from database (will return empty array if no data)
    const patternStats = await query(
      `SELECT 
        pa.alert_type,
        pa.threat_level,
        COUNT(*) as count,
        MAX(pa.created_at) as last_detected
      FROM phishing_alerts pa
      WHERE pa.business_id = $1
      GROUP BY pa.alert_type, pa.threat_level
      ORDER BY count DESC`,
      [req.user!.business_id]
    );

    // Define pattern descriptions
    const patternDescriptions = {
      'urgent_action_required': 'Uses urgency tactics to pressure immediate action',
      'account_suspension': 'Threatens account suspension or compromise',
      'financial_threat': 'Financial pressure or fake billing',
      'authority_impersonation': 'Impersonates authority figures or institutions',
      'ceo_fraud': 'CEO fraud or business email compromise',
      'suspicious_domain': 'Uses URL shorteners or redirect services',
      'typo_squatting': 'Potential typo-squatting domains',
      'personal_info_request': 'Requests sensitive personal information',
      'prize_winner': 'Prize or lottery scam tactics',
      'suspicious_attachments': 'Potentially malicious file attachments',
      'html_embedded_content': 'Embedded HTML content that could be malicious'
    };

    const patterns = ((patternStats.rows || []) as { pattern_name: string; count: number; alert_type: string }[]).map((stat) => ({
      ...stat,
      description: patternDescriptions[stat.alert_type as keyof typeof patternDescriptions] || 'Unknown pattern'
    }));

    res.json({
      success: true,
      patterns,
      totalPatterns: patterns.length
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/phishing/monitoring/status
 * @desc Get email monitoring service status
 * @access Private (Business users only)
 */
router.get('/monitoring/status', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    securityLogger.info('Getting monitoring status', {
      operation: 'get-monitoring-status'
    });
    
    let status = null;
    let stats = null;
    
    try {
      status = emailMonitor.getMonitoringStatus();
    } catch (error) {
      securityLogger.error('Error getting monitoring status', {
        operation: 'get-monitoring-status'
      }, error as Error);
      status = { isMonitoring: false, interval: 30000 };
    }
    
    try {
      stats = await emailMonitor.getMonitoringStats();
    } catch (error) {
      securityLogger.error('Error getting monitoring stats', {
        operation: 'get-monitoring-stats'
      }, error as Error);
      stats = {
        emails: {
          total_emails: 0,
          connected_emails: 0,
          disconnected_emails: 0,
          recently_checked: 0
        },
        scans: {
          total_scans: 0,
          successful_scans: 0,
          failed_scans: 0,
          avg_emails_per_scan: 0
        }
      };
    }

    res.json({
      success: true,
      monitoring: {
        status: status || { isMonitoring: false, interval: 30000 },
        statistics: stats || {
          emails: {
            total_emails: 0,
            connected_emails: 0,
            disconnected_emails: 0,
            recently_checked: 0
          },
          scans: {
            total_scans: 0,
            successful_scans: 0,
            failed_scans: 0,
            avg_emails_per_scan: 0
          }
        }
      }
    });

  } catch (error) {
    securityLogger.error('Error in monitoring status endpoint', {
      operation: 'get-monitoring-status'
    }, error as Error);
    // Return default data instead of error
    res.json({
      success: true,
      monitoring: {
        status: { isMonitoring: false, interval: 30000 },
        statistics: {
          emails: {
            total_emails: 0,
            connected_emails: 0,
            disconnected_emails: 0,
            recently_checked: 0
          },
          scans: {
            total_scans: 0,
            successful_scans: 0,
            failed_scans: 0,
            avg_emails_per_scan: 0
          }
        }
      }
    });
  }
});

/**
 * @route POST /api/phishing/monitoring/start
 * @desc Start email monitoring service
 * @access Private (Admin only - for now, business users)
 */
router.post('/monitoring/start', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    await emailMonitor.startMonitoring();

    res.json({
      success: true,
      message: 'Email monitoring service started successfully'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/phishing/monitoring/stop
 * @desc Stop email monitoring service
 * @access Private (Admin only - for now, business users)
 */
router.post('/monitoring/stop', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    emailMonitor.stopMonitoring();

    res.json({
      success: true,
      message: 'Email monitoring service stopped successfully'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/phishing/recommendations
 * @desc Get security recommendations based on threat patterns
 * @access Private (Business users only)
 */
router.get('/recommendations', authenticateToken, requireBusiness, async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;

    // Get recent threat patterns (will return empty array if no data)
    const recentThreats = await query(
      `SELECT 
        pa.threat_level,
        pa.alert_type,
        pa.created_at,
        me.email_address
      FROM phishing_alerts pa
      JOIN monitored_emails me ON pa.email_id = me.id
      WHERE pa.business_id = $1 
        AND pa.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY pa.created_at DESC`,
      [businessId]
    );

    // Generate recommendations based on threat patterns
    const recommendations = [];

    // Handle empty data gracefully
    const threats = recentThreats.rows || [];
    const threatCounts = (threats as { threat_level: string }[]).reduce((acc: Record<string, number>, threat) => {
      acc[threat.threat_level] = (acc[threat.threat_level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // High threat level recommendations
    if (threatCounts.critical > 0) {
      recommendations.push({
        priority: 'critical',
        title: 'Critical Threats Detected',
        description: `${threatCounts.critical} critical threats detected in the last 30 days`,
        action: 'Immediately review all critical alerts and implement additional security measures',
        category: 'immediate_action'
      });
    }

    if (threatCounts.high > 5) {
      recommendations.push({
        priority: 'high',
        title: 'High Threat Volume',
        description: `${threatCounts.high} high-level threats detected`,
        action: 'Consider implementing additional email filtering and user training',
        category: 'security_enhancement'
      });
    }

    // Pattern-based recommendations
    const patternCounts = (threats as { alert_type: string }[]).reduce((acc: Record<string, number>, threat) => {
      acc[threat.alert_type] = (acc[threat.alert_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    if (patternCounts.ceo_fraud > 0) {
      recommendations.push({
        priority: 'high',
        title: 'CEO Fraud Attempts Detected',
        description: 'Business Email Compromise (BEC) attempts detected',
        action: 'Implement additional verification procedures for financial transactions',
        category: 'bec_protection'
      });
    }

    if (patternCounts.suspicious_attachments > 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Malicious Attachments Detected',
        description: 'Suspicious file attachments have been blocked',
        action: 'Review and strengthen attachment filtering policies',
        category: 'attachment_security'
      });
    }

    // General recommendations (always show these for new businesses)
    recommendations.push({
      priority: 'medium',
      title: 'Regular Security Training',
      description: 'Keep your team updated on the latest phishing techniques',
      action: 'Schedule regular security awareness training sessions',
      category: 'user_education'
    });

    recommendations.push({
      priority: 'low',
      title: 'Email Authentication',
      description: 'Implement email authentication protocols',
      action: 'Set up SPF, DKIM, and DMARC records for your domain',
      category: 'email_authentication'
    });

    // Add onboarding recommendations for new businesses with no data
    if (threats.length === 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Set Up Email Monitoring',
        description: 'Add email addresses to start monitoring for phishing threats',
        action: 'Go to the Email Monitoring section and add your business email addresses',
        category: 'onboarding'
      });

      recommendations.push({
        priority: 'low',
        title: 'Review Security Settings',
        description: 'Configure your security preferences and notification settings',
        action: 'Check your dashboard settings and customize alert preferences',
        category: 'onboarding'
      });
    }

    res.json({
      success: true,
      recommendations,
      threatSummary: {
        totalThreats: threats.length,
        threatLevels: threatCounts,
        topPatterns: Object.entries(patternCounts as Record<string, number>)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([pattern, count]) => ({ pattern, count }))
      }
    });

  } catch (error) {
    next(error);
  }
});

export default router;
