import { Router } from 'express';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import { authenticateToken, requireGym, type AuthRequest } from '../middleware/auth.js';
import { addEmailSchema, updateEmailSchema, emailParamsSchema, emailQuerySchema } from '../schemas/email.js';
import { query } from '../../db/connection.js';

const router = Router();

// Get all monitored emails for the gym
router.get('/', authenticateToken, requireGym, validateQuery(emailQuerySchema), async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;
    const { page, limit, connected } = req.query as any;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE gym_id = $1';
    const queryParams = [gymId];

    // connected refers to the connection status of a monitored email address 
    // if connected is true, only show emails that are connected
    // if connected is false, only show emails that are not connected
    // if connected is undefined, show all emails
    
    if (connected !== undefined) {
      whereClause += ' AND is_connected = $2';
      queryParams.push(connected);
    }

    // Get emails with pagination
    const emailsResult = await query(
      `SELECT id, email_address, is_connected, last_checked, created_at, updated_at
       FROM monitored_emails 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, limit, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as count FROM monitored_emails ${whereClause}`,
      queryParams
    );

    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      emails: emailsResult.rows.map((email: any) => ({
        id: email.id,
        emailAddress: email.email_address,
        isConnected: email.is_connected,
        lastChecked: email.last_checked,
        createdAt: email.created_at,
        updatedAt: email.updated_at
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

// Add new email to monitor
router.post('/', authenticateToken, requireGym, validateBody(addEmailSchema), async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;
    const { emailAddress } = req.body;

    // Check if email already exists for this gym
    const existingResult = await query(
      'SELECT id FROM monitored_emails WHERE gym_id = $1 AND email_address = $2',
      [gymId, emailAddress]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({ error: 'Email address is already being monitored' });
    }

    // Add the email
    const result = await query(
      `INSERT INTO monitored_emails (gym_id, email_address, is_connected)
       VALUES ($1, $2, false)
       RETURNING id, email_address, is_connected, last_checked, created_at, updated_at`,
      [gymId, emailAddress]
    );

    const email = result.rows[0];

    // Log the event
    await query(
      `INSERT INTO security_events (gym_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'email_added', 'Email address added for monitoring: $2', $3, $4)`,
      [gymId, emailAddress, req.ip, req.get('User-Agent')]
    );

    res.status(201).json({
      message: 'Email address added for monitoring',
      email: {
        id: email.id,
        emailAddress: email.email_address,
        isConnected: email.is_connected,
        lastChecked: email.last_checked,
        createdAt: email.created_at,
        updatedAt: email.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update email connection status
router.put('/:id', authenticateToken, requireGym, validateParams(emailParamsSchema), validateBody(updateEmailSchema), async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;
    const emailId = req.params.id;
    const { isConnected } = req.body;

    // Verify the email belongs to this gym
    const verifyResult = await query(
      'SELECT id, email_address FROM monitored_emails WHERE id = $1 AND gym_id = $2',
      [emailId, gymId]
    );

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Update the connection status
    const result = await query(
      `UPDATE monitored_emails 
       SET is_connected = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND gym_id = $3
       RETURNING id, email_address, is_connected, last_checked, created_at, updated_at`,
      [isConnected, emailId, gymId]
    );

    const email = result.rows[0];

    // Log the event
    await query(
      `INSERT INTO security_events (gym_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'email_connection_updated', 'Email connection status updated for $2: $3', $4, $5)`,
      [gymId, email.email_address, isConnected ? 'connected' : 'disconnected', req.ip, req.get('User-Agent')]
    );

    res.json({
      message: 'Email connection status updated',
      email: {
        id: email.id,
        emailAddress: email.email_address,
        isConnected: email.is_connected,
        lastChecked: email.last_checked,
        createdAt: email.created_at,
        updatedAt: email.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Remove email from monitoring
router.delete('/:id', authenticateToken, requireGym, validateParams(emailParamsSchema), async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;
    const emailId = req.params.id;

    // Get email info before deletion for logging
    const emailResult = await query(
      'SELECT email_address FROM monitored_emails WHERE id = $1 AND gym_id = $2',
      [emailId, gymId]
    );

    if (emailResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const emailAddress = emailResult.rows[0].email_address;

    // Delete the email
    await query('DELETE FROM monitored_emails WHERE id = $1 AND gym_id = $2', [emailId, gymId]);

    // Log the event
    await query(
      `INSERT INTO security_events (gym_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'email_removed', 'Email address removed from monitoring: $2', $3, $4)`,
      [gymId, emailAddress, req.ip, req.get('User-Agent')]
    );

    res.json({ message: 'Email address removed from monitoring' });
  } catch (error) {
    next(error);
  }
});

// Get email monitoring statistics
router.get('/stats', authenticateToken, requireGym, async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;

    // Get total emails count
    const totalResult = await query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE gym_id = $1',
      [gymId]
    );

    // Get connected emails count
    const connectedResult = await query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE gym_id = $1 AND is_connected = true',
      [gymId]
    );

    // Get emails with recent activity (last 24 hours)
    const recentResult = await query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE gym_id = $1 AND last_checked >= NOW() - INTERVAL \'24 hours\'',
      [gymId]
    );

    res.json({
      stats: {
        totalEmails: parseInt(totalResult.rows[0].count),
        connectedEmails: parseInt(connectedResult.rows[0].count),
        disconnectedEmails: parseInt(totalResult.rows[0].count) - parseInt(connectedResult.rows[0].count),
        recentActivity: parseInt(recentResult.rows[0].count)
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
