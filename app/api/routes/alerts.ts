import { Router } from 'express';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import { authenticateToken, requireGym, type AuthRequest } from '../middleware/auth.js';
import { updateAlertSchema, alertParamsSchema, alertQuerySchema, createAlertSchema } from '../schemas/alerts.js';
import { query } from '../../db/connection.js';

const router = Router();

// Get all alerts for the gym
router.get('/', authenticateToken, requireGym, validateQuery(alertQuerySchema), async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;
    const { page, limit, status, threatLevel, emailId, startDate, endDate } = req.query as any;

    const offset = ((page - 1) * limit);
    let whereClause = 'WHERE pa.gym_id = $1';
    const queryParams = [gymId];
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

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      alerts: alertsResult.rows.map((alert: any) => ({
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
      })),
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

// Get specific alert
router.get('/:id', authenticateToken, requireGym, validateParams(alertParamsSchema), async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;
    const alertId = req.params.id;

    const result = await query(
      `SELECT pa.id, pa.email_id, pa.subject, pa.sender_email, pa.recipient_email,
              pa.threat_level, pa.status, pa.alert_type, pa.description, pa.raw_email_data,
              pa.created_at, pa.updated_at, me.email_address
       FROM phishing_alerts pa
       LEFT JOIN monitored_emails me ON me.id = pa.email_id
       WHERE pa.id = $1 AND pa.gym_id = $2`,
      [alertId, gymId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const alert = result.rows[0];
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
router.put('/:id', authenticateToken, requireGym, validateParams(alertParamsSchema), validateBody(updateAlertSchema), async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;
    const alertId = req.params.id;
    const updates = req.body;

    // Verify the alert belongs to this gym
    const verifyResult = await query(
      'SELECT id, status FROM phishing_alerts WHERE id = $1 AND gym_id = $2',
      [alertId, gymId]
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

    values.push(alertId, gymId);
    const queryText = `
      UPDATE phishing_alerts 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount} AND gym_id = $${paramCount + 1}
      RETURNING id, email_id, subject, sender_email, recipient_email, threat_level, status, alert_type, description, raw_email_data, created_at, updated_at
    `;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const alert = result.rows[0];

    // Log the event
    await query(
      `INSERT INTO security_events (gym_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'alert_updated', 'Alert $2 status updated to $3', $4, $5)`,
      [gymId, alertId, updates.status || 'modified', req.ip, req.get('User-Agent')]
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
router.post('/', authenticateToken, requireGym, validateBody(createAlertSchema), async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;
    const { emailId, subject, senderEmail, recipientEmail, threatLevel, alertType, description, rawEmailData } = req.body;

    // Verify the email belongs to this gym
    const emailResult = await query(
      'SELECT id FROM monitored_emails WHERE id = $1 AND gym_id = $2',
      [emailId, gymId]
    );

    if (emailResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found or does not belong to your gym' });
    }

    // Create the alert
    const result = await query(
      `INSERT INTO phishing_alerts (gym_id, email_id, subject, sender_email, recipient_email, threat_level, alert_type, description, raw_email_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, email_id, subject, sender_email, recipient_email, threat_level, status, alert_type, description, raw_email_data, created_at, updated_at`,
      [gymId, emailId, subject, senderEmail, recipientEmail, threatLevel, alertType, description, rawEmailData]
    );

    const alert = result.rows[0];

    // Log the event
    await query(
      `INSERT INTO security_events (gym_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'alert_created', 'New phishing alert created: $2', $3, $4)`,
      [gymId, alertType, req.ip, req.get('User-Agent')]
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

// Get alert statistics
router.get('/stats', authenticateToken, requireGym, async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;

    // Get total alerts count
    const totalResult = await query(
      'SELECT COUNT(*) as count FROM phishing_alerts WHERE gym_id = $1',
      [gymId]
    );

    // Get alerts by status
    const statusResult = await query(
      `SELECT status, COUNT(*) as count 
       FROM phishing_alerts 
       WHERE gym_id = $1 
       GROUP BY status`,
      [gymId]
    );

    // Get alerts by threat level
    const threatLevelResult = await query(
      `SELECT threat_level, COUNT(*) as count 
       FROM phishing_alerts 
       WHERE gym_id = $1 
       GROUP BY threat_level`,
      [gymId]
    );

    // Get recent alerts (last 7 days)
    const recentResult = await query(
      'SELECT COUNT(*) as count FROM phishing_alerts WHERE gym_id = $1 AND created_at >= NOW() - INTERVAL \'7 days\'',
      [gymId]
    );

    // Get alerts by day (last 7 days)
    const dailyResult = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count 
       FROM phishing_alerts 
       WHERE gym_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [gymId]
    );

    const statusCounts = statusResult.rows.reduce((acc: any, row: any) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    const threatLevelCounts = threatLevelResult.rows.reduce((acc: any, row: any) => {
      acc[row.threat_level] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);

    res.json({
      stats: {
        totalAlerts: parseInt(totalResult.rows[0].count),
        recentAlerts: parseInt(recentResult.rows[0].count),
        statusCounts,
        threatLevelCounts,
        dailyAlerts: dailyResult.rows.map((row: any) => ({
          date: row.date,
          count: parseInt(row.count)
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
