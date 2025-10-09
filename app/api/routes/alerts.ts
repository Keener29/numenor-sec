import { Router } from 'express';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import { authenticateToken, requireBusiness, type AuthRequest } from '../middleware/auth.js';
import { updateAlertSchema, alertParamsSchema, alertQuerySchema, createAlertSchema } from '../schemas/alerts.js';
import { query } from '../../db/connection.js';
import { oauthLogger } from '../services/logger.js';

const router = Router();

// Get all alerts for the business
router.get('/', authenticateToken, requireBusiness, validateQuery(alertQuerySchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const { page, limit, status, threatLevel, emailId, startDate, endDate } = req.query as any;

    const offset = ((page - 1) * limit);
    let whereClause = 'WHERE pa.business_id = $1';
    const queryParams = [businessId];
    let paramCount = 2;

    if (status) {
      whereClause += ` AND pa.status = $${paramCount++}`;
      queryParams.push(status);
    }
    if (threatLevel) {
      whereClause += ` AND pa.threat_level = $${paramCount++}`;
      queryParams.push(threatLevel);
    }
    if (emailId) {
      whereClause += ` AND pa.email_id = $${paramCount++}`;
      queryParams.push(emailId);
    }
    if (startDate) {
      whereClause += ` AND pa.created_at >= $${paramCount++}`;
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClause += ` AND pa.created_at <= $${paramCount++}`;
      queryParams.push(endDate);
    }

    // Get alerts with pagination
    const alertsResult = await query(
      `SELECT pa.id, pa.email_id, pa.subject, pa.sender_email, pa.recipient_email,
              pa.threat_level, pa.status, pa.alert_type, pa.description, pa.raw_email_data,
              pa.created_at, pa.updated_at, me.email_address
       FROM phishing_alerts pa
       LEFT JOIN monitored_emails me ON me.id = pa.email_id
       ${whereClause}
       ORDER BY pa.created_at DESC
       LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...queryParams, limit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as count FROM phishing_alerts pa ${whereClause}`,
      queryParams
    );

    const totalCount = parseInt((countResult.rows[0] as { count: string }).count);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      alerts: alertsResult.rows.map((alert) => {
        const typedAlert = alert as {
          id: number;
          email_id: number;
          email_address: string;
          subject: string;
          sender_email: string;
          recipient_email: string;
          threat_level: string;
          status: string;
          alert_type: string;
          description: string;
          raw_email_data: string;
          created_at: Date;
          updated_at: Date;
        };
        return {
          id: typedAlert.id,
          emailId: typedAlert.email_id,
          emailAddress: typedAlert.email_address,
          subject: typedAlert.subject,
          senderEmail: typedAlert.sender_email,
          recipientEmail: typedAlert.recipient_email,
          threatLevel: typedAlert.threat_level,
          status: typedAlert.status,
          alertType: typedAlert.alert_type,
          description: typedAlert.description,
          rawEmailData: typedAlert.raw_email_data,
          createdAt: typedAlert.created_at,
          updatedAt: typedAlert.updated_at
        };
      }),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get alert statistics
router.get('/stats', authenticateToken, requireBusiness, async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;

    // Get total alerts count
    const totalResult = await query(
      'SELECT COUNT(*) as count FROM phishing_alerts WHERE business_id = $1',
      [businessId]
    );

    // Get alerts by status
    const statusResult = await query(
      `SELECT status, COUNT(*) as count 
       FROM phishing_alerts 
       WHERE business_id = $1 
       GROUP BY status`,
      [businessId]
    );

    // Get alerts by threat level
    const threatLevelResult = await query(
      `SELECT threat_level, COUNT(*) as count 
       FROM phishing_alerts 
       WHERE business_id = $1 
       GROUP BY threat_level`,
      [businessId]
    );

    // Get recent alerts (last 7 days)
    const recentResult = await query(
      'SELECT COUNT(*) as count FROM phishing_alerts WHERE business_id = $1 AND created_at >= NOW() - INTERVAL \'7 days\'',
      [businessId]
    );

    // Get alerts by day (last 7 days)
    const dailyResult = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count 
       FROM phishing_alerts 
       WHERE business_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [businessId]
    );

    const statusCounts = statusResult.rows.reduce((acc: Record<string, number>, row) => {
      acc[(row as { status: string }).status] = parseInt((row as { count: string }).count);
      return acc;
    }, {} as Record<string, number>);

    const threatLevelCounts = threatLevelResult.rows.reduce((acc: Record<string, number>, row) => {
      acc[(row as { threat_level: string }).threat_level] = parseInt((row as { count: string }).count);
      return acc;
    }, {} as Record<string, number>);

    const stats = {
      totalAlerts: parseInt((totalResult.rows[0] as { count: string }).count),
      recentAlerts: parseInt((recentResult.rows[0] as { count: string }).count),
      statusCounts,
      threatLevelCounts,
      dailyAlerts: dailyResult.rows.map((row) => ({
        date: (row as { date: string }).date,
        count: parseInt((row as { count: string }).count)
      }))
    };
    
    oauthLogger.debug('Alert stats response generated', {
      operation: 'get-alert-stats',
      businessId,
      metadata: { stats, dailyAlertsCount: dailyResult.rows.length }
    });
    
    res.json({
      stats
    });
  } catch (error) {
    next(error);
  }
});

// Get specific alert
router.get('/:id', authenticateToken, requireBusiness, validateParams(alertParamsSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const alertId = req.params.id;

    const result = await query(
      `SELECT pa.id, pa.email_id, pa.subject, pa.sender_email, pa.recipient_email,
              pa.threat_level, pa.status, pa.alert_type, pa.description, pa.raw_email_data,
              pa.created_at, pa.updated_at, me.email_address
       FROM phishing_alerts pa
       LEFT JOIN monitored_emails me ON me.id = pa.email_id
       WHERE pa.id = $1 AND pa.business_id = $2`,
      [alertId, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const alert = result.rows[0] as {
      id: number;
      email_id: number;
      email_address: string;
      subject: string;
      sender_email: string;
      recipient_email: string;
      threat_level: string;
      status: string;
      alert_type: string;
      description: string;
      raw_email_data: string;
      created_at: Date;
      updated_at: Date;
    };
    res.json({
      alert: {
        id: alert.id,
        emailId: alert.email_id,
        emailAddress: alert.email_address,
        subject: alert.subject,
        senderEmail: alert.sender_email,
        recipientEmail: alert.recipient_email,
        threatLevel: alert.threat_level,
        status: alert.status,
        alertType: alert.alert_type,
        description: alert.description,
        rawEmailData: alert.raw_email_data,
        createdAt: alert.created_at,
        updatedAt: alert.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update alert status
router.put('/:id', authenticateToken, requireBusiness, validateParams(alertParamsSchema), validateBody(updateAlertSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const alertId = req.params.id;
    const updates = req.body;

    // Verify the alert belongs to this business
    const verifyResult = await query(
      'SELECT id, status FROM phishing_alerts WHERE id = $1 AND business_id = $2',
      [alertId, businessId]
    );

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (updates.status !== undefined) {
      updateFields.push(`status = $${paramCount++}`);
      values.push(updates.status);
    }
    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramCount++}`);
      values.push(updates.description);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(alertId, businessId);
    const queryText = `
      UPDATE phishing_alerts 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount} AND business_id = $${paramCount + 1}
      RETURNING id, email_id, subject, sender_email, recipient_email, threat_level, status, alert_type, description, raw_email_data, created_at, updated_at
    `;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const alert = result.rows[0] as {
      id: number;
      email_id: number;
      subject: string;
      sender_email: string;
      recipient_email: string;
      threat_level: string;
      status: string;
      alert_type: string;
      description: string;
      raw_email_data: string;
      created_at: Date;
      updated_at: Date;
    };

    // Log the event
    const clientIP = req.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
                     req.get('X-Real-IP') || 
                     req.get('CF-Connecting-IP') || 
                     req.ip || 
                     'unknown';
    
    await query(
      `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'alert_updated', $2, $3, $4)`,
      [businessId, `Alert ${alertId} status updated to ${updates.status || 'modified'}`, clientIP, req.get('User-Agent') || null]
    );

    res.json({
      message: 'Alert updated successfully',
      alert: {
        id: alert.id,
        emailId: alert.email_id,
        subject: alert.subject,
        senderEmail: alert.sender_email,
        recipientEmail: alert.recipient_email,
        threatLevel: alert.threat_level,
        status: alert.status,
        alertType: alert.alert_type,
        description: alert.description,
        rawEmailData: alert.raw_email_data,
        createdAt: alert.created_at,
        updatedAt: alert.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Create new alert (for testing or manual entry)
router.post('/', authenticateToken, requireBusiness, validateBody(createAlertSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const { emailId, subject, senderEmail, recipientEmail, threatLevel, alertType, description, rawEmailData } = req.body;

    // Verify the email belongs to this business
    const emailResult = await query(
      'SELECT id FROM monitored_emails WHERE id = $1 AND business_id = $2',
      [emailId, businessId]
    );

    if (emailResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found or does not belong to your business' });
    }

    // Create the alert
    const result = await query(
      `INSERT INTO phishing_alerts (business_id, email_id, subject, sender_email, recipient_email, threat_level, alert_type, description, raw_email_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, email_id, subject, sender_email, recipient_email, threat_level, status, alert_type, description, raw_email_data, created_at, updated_at`,
      [businessId, parseInt(emailId), subject, senderEmail, recipientEmail, threatLevel, alertType, description || null, rawEmailData || null]
    );

    const alert = result.rows[0] as {
      id: number;
      email_id: number;
      subject: string;
      sender_email: string;
      recipient_email: string;
      threat_level: string;
      status: string;
      alert_type: string;
      description: string;
      raw_email_data: string;
      created_at: Date;
      updated_at: Date;
    };

    // Log the event
    const clientIP = req.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
                     req.get('X-Real-IP') || 
                     req.get('CF-Connecting-IP') || 
                     req.ip || 
                     'unknown';
    
    await query(
      `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'alert_created', $2, $3, $4)`,
      [businessId, `New phishing alert created: ${alertType}`, clientIP, req.get('User-Agent') || null]
    );

    res.status(201).json({
      message: 'Alert created successfully',
      alert: {
        id: alert.id,
        emailId: alert.email_id,
        subject: alert.subject,
        senderEmail: alert.sender_email,
        recipientEmail: alert.recipient_email,
        threatLevel: alert.threat_level,
        status: alert.status,
        alertType: alert.alert_type,
        description: alert.description,
        rawEmailData: alert.raw_email_data,
        createdAt: alert.created_at,
        updatedAt: alert.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
