import { Router } from 'express';
import { validateBody, validateParams } from '../middleware/validation.js';
import { authenticateToken, requireBusiness, type AuthRequest } from '../middleware/auth.js';
import { updateBusinessSchema, businessParamsSchema } from '../schemas/business.js';
import { query } from '../../db/connection.js';

const router = Router();

// Get business information
router.get('/', authenticateToken, requireBusiness, async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;

    const result = await query(
      `SELECT id, business_name, address, phone, website, member_count, is_active, created_at, updated_at
       FROM businesses 
       WHERE id = $1`,
      [businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const business = result.rows[0] as {
      id: number;
      business_name: string | null;
      address: string;
      phone: string;
      website: string;
      member_count: number;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    };
    res.json({
      business: {
        id: business.id,
        name: business.business_name,
        address: business.address,
        phone: business.phone,
        website: business.website,
        memberCount: business.member_count,
        isActive: business.is_active,
        createdAt: business.created_at,
        updatedAt: business.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update business information
router.put('/', authenticateToken, requireBusiness, validateBody(updateBusinessSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const updates = req.body;

    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      updateFields.push(`business_name = $${paramCount++}`);
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

    values.push(businessId);
    const queryText = `
      UPDATE businesses 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING id, business_name, address, phone, website, member_count, is_active, created_at, updated_at
    `;

    const result = await query(queryText, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const business = result.rows[0] as {
      id: number;
      business_name: string | null;
      address: string;
      phone: string;
      website: string;
      member_count: number;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    };

    // Log the update event
    await query(
      `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'business_updated', 'Business information updated', $2, $3)`,
      [businessId, req.ip, req.get('User-Agent')]
    );

    res.json({
      message: 'Business updated successfully',
      business: {
        id: business.id,
        name: business.business_name,
        address: business.address,
        phone: business.phone,
        website: business.website,
        memberCount: business.member_count,
        isActive: business.is_active,
        createdAt: business.created_at,
        updatedAt: business.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get business statistics
router.get('/stats', authenticateToken, requireBusiness, async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;

    // Get monitored emails count
    const emailsResult = await query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE business_id = $1',
      [businessId]
    );

    // Get total alerts count
    const alertsResult = await query(
      'SELECT COUNT(*) as count FROM phishing_alerts WHERE business_id = $1',
      [businessId]
    );

    // Get pending alerts count
    const pendingAlertsResult = await query(
      'SELECT COUNT(*) as count FROM phishing_alerts WHERE business_id = $1 AND status = $2',
      [businessId, 'pending']
    );

    // Get recent alerts (last 7 days)
    const recentAlertsResult = await query(
      'SELECT COUNT(*) as count FROM phishing_alerts WHERE business_id = $1 AND created_at >= NOW() - INTERVAL \'7 days\'',
      [businessId]
    );

    // Get connected emails count (those with OAuth tokens)
    const connectedEmailsResult = await query(
      `SELECT COUNT(*) as count 
       FROM monitored_emails me
       INNER JOIN oauth_tokens ot ON me.business_id = ot.business_id AND me.email_address = ot.email_address
       WHERE me.business_id = $1`,
      [businessId]
    );

    res.json({
      stats: {
        totalEmails: Number.parseInt((emailsResult.rows[0] as { count: string }).count),
        connectedEmails: Number.parseInt((connectedEmailsResult.rows[0] as { count: string }).count),
        totalAlerts: Number.parseInt((alertsResult.rows[0] as { count: string }).count),
        pendingAlerts: Number.parseInt((pendingAlertsResult.rows[0] as { count: string }).count),
        recentAlerts: Number.parseInt((recentAlertsResult.rows[0] as { count: string }).count)
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
