import { Router } from 'express';
import { authenticateToken, requireBusiness, type AuthRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';
import { phishingDetector, type EmailAnalysis } from '../services/phishingDetector.js';
import { emailMonitor } from '../services/emailMonitor.js';
import { query } from '../../db/connection.js';
import { z } from 'zod';

const router = Router();

// Schema for email analysis request
const emailAnalysisSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Email body is required'),
  sender: z.string().email('Valid sender email is required'),
  recipient: z.string().email('Valid recipient email is required'),
  attachments: z.array(z.string()).optional(),
  links: z.array(z.string()).optional()
});

// Schema for manual scan request
const manualScanSchema = z.object({
  emailId: z.number().int().positive('Valid email ID is required').optional(),
  businessId: z.number().int().positive('Valid business ID is required').optional()
});

/**
 * @route POST /api/phishing/analyze
 * @desc Analyze email content for phishing threats
 * @access Private (Business users only)
 */
router.post('/analyze', authenticateToken, requireBusiness, validateBody(emailAnalysisSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const emailData: EmailAnalysis = req.body;

    console.log(`Analyzing email from ${emailData.sender} to ${emailData.recipient}`);

    // Analyze email for phishing threats
    const threatAssessment = await phishingDetector.analyzeEmail(emailData);

    // Store assessment if threat level is medium or higher
    if (['medium', 'high', 'critical'].includes(threatAssessment.threatLevel)) {
      // Find the monitored email ID for this recipient
      const emailResult = await query(
        'SELECT id FROM monitored_emails WHERE email_address = $1 AND business_id = $2',
        [emailData.recipient, businessId]
      );

      if (emailResult.rows.length > 0) {
        const emailId = emailResult.rows[0].id;
        await phishingDetector.storeThreatAssessment(
          businessId,
          emailId,
          threatAssessment,
          emailData
        );
      }
    }

    res.json({
      success: true,
      threatAssessment,
      message: `Email analyzed successfully. Threat level: ${threatAssessment.threatLevel}`
    });

  } catch (error) {
    next(error);
  }
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
      // Scan specific email
      const emailResult = await query(
        'SELECT id, business_id, email_address FROM monitored_emails WHERE id = $1 AND business_id = $2',
        [emailId, businessId]
      );

      if (emailResult.rows.length === 0) {
        return res.status(404).json({ error: 'Email not found or access denied' });
      }

      const email = emailResult.rows[0];
      console.log(`Manual scan triggered for email: ${email.email_address}`);

      // Trigger scan for specific email
      await emailMonitor.triggerBusinessScan(businessId);

      res.json({
        success: true,
        message: `Manual scan triggered for email: ${email.email_address}`,
        emailId: email.id
      });

    } else {
      // Scan all business emails
      console.log(`Manual scan triggered for business: ${businessId}`);

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
router.get('/statistics', authenticateToken, requireBusiness, async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const days = parseInt(req.query.days as string) || 30;

    console.log(`Getting statistics for business ${businessId}`);

    // Get threat statistics (will return empty array if no data)
    let threatStats = [];
    try {
      threatStats = await phishingDetector.getThreatStatistics(businessId, days);
    } catch (error) {
      console.error('Error getting threat statistics:', error);
      threatStats = [];
    }

    // Get monitoring statistics (will return default values if no data)
    let monitoringStats = null;
    try {
      monitoringStats = await emailMonitor.getMonitoringStats();
    } catch (error) {
      console.error('Error getting monitoring stats:', error);
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
    let recentAlerts = { rows: [] };
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
      console.error('Error getting recent alerts:', error);
      recentAlerts = { rows: [] };
    }

    // Calculate summary statistics (handle empty data gracefully)
    const summary = {
      totalAlerts: threatStats?.length || 0,
      criticalAlerts: threatStats?.filter((stat: any) => stat.threat_level === 'critical').length || 0,
      highAlerts: threatStats?.filter((stat: any) => stat.threat_level === 'high').length || 0,
      mediumAlerts: threatStats?.filter((stat: any) => stat.threat_level === 'medium').length || 0,
      lowAlerts: threatStats?.filter((stat: any) => stat.threat_level === 'low').length || 0,
      pendingAlerts: recentAlerts.rows?.filter((alert: any) => alert.status === 'pending').length || 0,
      safeAlerts: recentAlerts.rows?.filter((alert: any) => alert.status === 'safe').length || 0
    };

    res.json({
      success: true,
      statistics: {
        summary,
        threatBreakdown: threatStats || [],
        recentAlerts: recentAlerts.rows || [],
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
    console.error('Error in statistics endpoint:', error);
    // Return default data instead of error
    res.json({
      success: true,
      statistics: {
        summary: {
          totalAlerts: 0,
          criticalAlerts: 0,
          highAlerts: 0,
          mediumAlerts: 0,
          lowAlerts: 0,
          pendingAlerts: 0,
          safeAlerts: 0
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
router.get('/patterns', authenticateToken, async (req: AuthRequest, res, next) => {
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

    const patterns = (patternStats.rows || []).map((stat: any) => ({
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
    console.log('Getting monitoring status');
    
    let status = null;
    let stats = null;
    
    try {
      status = emailMonitor.getMonitoringStatus();
    } catch (error) {
      console.error('Error getting monitoring status:', error);
      status = { isMonitoring: false, interval: 30000 };
    }
    
    try {
      stats = await emailMonitor.getMonitoringStats();
    } catch (error) {
      console.error('Error getting monitoring stats:', error);
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
    console.error('Error in monitoring status endpoint:', error);
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
    const threatCounts = threats.reduce((acc: any, threat: any) => {
      acc[threat.threat_level] = (acc[threat.threat_level] || 0) + 1;
      return acc;
    }, {});

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
    const patternCounts = threats.reduce((acc: any, threat: any) => {
      acc[threat.alert_type] = (acc[threat.alert_type] || 0) + 1;
      return acc;
    }, {});

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
        topPatterns: Object.entries(patternCounts)
          .sort(([,a], [,b]) => (b as number) - (a as number))
          .slice(0, 5)
          .map(([pattern, count]) => ({ pattern, count }))
      }
    });

  } catch (error) {
    next(error);
  }
});

export default router;
