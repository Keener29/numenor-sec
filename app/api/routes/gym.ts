import { Router } from 'express';
import { validateBody, validateParams } from '../middleware/validation.js';
import { authenticateToken, requireGym, type AuthRequest } from '../middleware/auth.js';
import { updateGymSchema, gymParamsSchema } from '../schemas/gym.js';
import { query } from '../../db/connection.js';

const router = Router();

// Get gym information
router.get('/', authenticateToken, requireGym, async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;

    const result = await query(
      `SELECT id, name, address, phone, website, member_count, is_active, created_at, updated_at
       FROM gyms 
       WHERE id = $1`,
      [gymId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Gym not found' });
    }

    const gym = result.rows[0];
    res.json({
      gym: {
        id: gym.id,
        name: gym.name,
        address: gym.address,
        phone: gym.phone,
        website: gym.website,
        memberCount: gym.member_count,
        isActive: gym.is_active,
        createdAt: gym.created_at,
        updatedAt: gym.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update gym information
router.put('/', authenticateToken, requireGym, validateBody(updateGymSchema), async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;
    const updates = req.body;

    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.address !== undefined) {
      updateFields.push(`address = $${paramCount++}`);
      values.push(updates.address);
    }
    if (updates.phone !== undefined) {
      updateFields.push(`phone = $${paramCount++}`);
      values.push(updates.phone);
    }
    if (updates.website !== undefined) {
      updateFields.push(`website = $${paramCount++}`);
      values.push(updates.website);
    }
    if (updates.memberCount !== undefined) {
      updateFields.push(`member_count = $${paramCount++}`);
      values.push(updates.memberCount);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(gymId);
    const queryText = `
      UPDATE gyms 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING id, name, address, phone, website, member_count, is_active, created_at, updated_at
    `;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Gym not found' });
    }

    const gym = result.rows[0];

    // Log the update event
    await query(
      `INSERT INTO security_events (gym_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'gym_updated', 'Gym information updated', $2, $3)`,
      [gymId, req.ip, req.get('User-Agent')]
    );

    res.json({
      message: 'Gym updated successfully',
      gym: {
        id: gym.id,
        name: gym.name,
        address: gym.address,
        phone: gym.phone,
        website: gym.website,
        memberCount: gym.member_count,
        isActive: gym.is_active,
        createdAt: gym.created_at,
        updatedAt: gym.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get gym statistics
router.get('/stats', authenticateToken, requireGym, async (req: AuthRequest, res, next) => {
  try {
    const gymId = req.user!.gym_id!;

    // Get monitored emails count
    const emailsResult = await query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE gym_id = $1',
      [gymId]
    );

    // Get total alerts count
    const alertsResult = await query(
      'SELECT COUNT(*) as count FROM phishing_alerts WHERE gym_id = $1',
      [gymId]
    );

    // Get pending alerts count
    const pendingAlertsResult = await query(
      'SELECT COUNT(*) as count FROM phishing_alerts WHERE gym_id = $1 AND status = $2',
      [gymId, 'pending']
    );

    // Get recent alerts (last 7 days)
    const recentAlertsResult = await query(
      'SELECT COUNT(*) as count FROM phishing_alerts WHERE gym_id = $1 AND created_at >= NOW() - INTERVAL \'7 days\'',
      [gymId]
    );

    // Get connected emails count
    const connectedEmailsResult = await query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE gym_id = $1 AND is_connected = true',
      [gymId]
    );

    res.json({
      stats: {
        totalEmails: parseInt(emailsResult.rows[0].count),
        connectedEmails: parseInt(connectedEmailsResult.rows[0].count),
        totalAlerts: parseInt(alertsResult.rows[0].count),
        pendingAlerts: parseInt(pendingAlertsResult.rows[0].count),
        recentAlerts: parseInt(recentAlertsResult.rows[0].count)
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
