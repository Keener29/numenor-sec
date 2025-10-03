import { Router } from 'express';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import { authenticateToken, requireBusiness, type AuthRequest } from '../middleware/auth.js';
import { addEmailSchema, updateEmailSchema, emailParamsSchema, emailQuerySchema } from '../schemas/email.js';
import { query } from '../../db/connection.js';
import { emailService } from '../utils/emailService.js';

const router = Router();

// Get all monitored emails for the business
router.get('/', authenticateToken, requireBusiness, validateQuery(emailQuerySchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const { page, limit, connected } = req.query as any;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE business_id = $1';
    const queryParams = [businessId];

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
router.post('/', authenticateToken, requireBusiness, validateBody(addEmailSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const { emailAddress } = req.body;

    // Check if email already exists for this business
    const existingResult = await query(
      'SELECT id FROM monitored_emails WHERE business_id = $1 AND email_address = $2',
      [businessId, emailAddress]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({ error: 'Email address is already being monitored' });
    }

    // Get business name and owner email for the email
    const businessResult = await query(
      `SELECT b.name, u.email as owner_email 
       FROM businesses b 
       JOIN users u ON b.owner_id = u.id 
       WHERE b.id = $1`,
      [businessId]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const businessName = businessResult.rows[0].name;
    const businessEmail = businessResult.rows[0].owner_email;

    // Add the email
    const result = await query(
      `INSERT INTO monitored_emails (business_id, email_address, is_connected)
       VALUES ($1, $2, $3)
       RETURNING id, email_address, is_connected, last_checked, created_at, updated_at`,
      [businessId, emailAddress, false]
    );

    const email = result.rows[0];

    // Send permission request email
    try {
      await emailService.sendPermissionRequest(businessName, emailAddress, businessEmail);
      
      // Log successful email send
      await query(
        `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
         VALUES ($1, 'permission_email_sent', $2, $3, $4)`,
        [businessId, `Permission request email sent to: ${emailAddress}`, req.ip, req.get('User-Agent')]
      );
    } catch (emailError) {
      // Log email send failure but don't fail the entire operation
      console.error('Failed to send permission request email:', emailError);
      await query(
        `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
         VALUES ($1, 'permission_email_failed', $2, $3, $4)`,
        [businessId, `Failed to send permission request email to: ${emailAddress} - ${emailError instanceof Error ? emailError.message : 'Unknown error'}`, req.ip, req.get('User-Agent')]
      );
    }

    // Log the email addition event
    await query(
      `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'email_added', $2, $3, $4)`,
      [businessId, `Email address added for monitoring: ${emailAddress}`, req.ip, req.get('User-Agent')]
    );

    res.status(201).json({
      message: 'Email address added for monitoring. Permission request email has been sent.',
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
router.put('/:id', authenticateToken, requireBusiness, validateParams(emailParamsSchema), validateBody(updateEmailSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const emailId = req.params.id;
    const { isConnected } = req.body;

    // Verify the email belongs to this business
    const verifyResult = await query(
      'SELECT id, email_address FROM monitored_emails WHERE id = $1 AND business_id = $2',
      [emailId, businessId]
    );

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    // Update the connection status
    const result = await query(
      `UPDATE monitored_emails 
       SET is_connected = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND business_id = $3
       RETURNING id, email_address, is_connected, last_checked, created_at, updated_at`,
      [isConnected, emailId, businessId]
    );

    const email = result.rows[0];

    // Log the event
    await query(
      `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'email_connection_updated', $2, $3, $4)`,
      [businessId, `Email connection status updated for ${email.email_address}: ${isConnected ? 'connected' : 'disconnected'}`, req.ip, req.get('User-Agent')]
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

// Resend permission request email
router.post('/:id/resend', authenticateToken, requireBusiness, validateParams(emailParamsSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const emailId = req.params.id;

    // Verify the email belongs to this business and get email details
    const emailResult = await query(
      'SELECT id, email_address FROM monitored_emails WHERE id = $1 AND business_id = $2',
      [emailId, businessId]
    );

    if (emailResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const emailAddress = emailResult.rows[0].email_address;

    // Get business name and owner email for the email
    const businessResult = await query(
      `SELECT b.name, u.email as owner_email 
       FROM businesses b 
       JOIN users u ON b.owner_id = u.id 
       WHERE b.id = $1`,
      [businessId]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const businessName = businessResult.rows[0].name;
    const businessEmail = businessResult.rows[0].owner_email;

    // Send permission request email
    try {
      await emailService.sendPermissionRequest(businessName, emailAddress, businessEmail);
      
      // Log successful email send
      await query(
        `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
         VALUES ($1, 'permission_email_resent', $2, $3, $4)`,
        [businessId, `Permission request email resent to: ${emailAddress}`, req.ip, req.get('User-Agent')]
      );

      res.json({
        message: 'Permission request email resent successfully',
        emailAddress: emailAddress
      });
    } catch (emailError) {
      // Log email send failure
      console.error('Failed to resend permission request email:', emailError);
      await query(
        `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
         VALUES ($1, 'permission_email_resend_failed', $2, $3, $4)`,
        [businessId, `Failed to resend permission request email to: ${emailAddress} - ${emailError instanceof Error ? emailError.message : 'Unknown error'}`, req.ip, req.get('User-Agent')]
      );

      res.status(500).json({ 
        error: 'Failed to resend permission request email',
        details: emailError instanceof Error ? emailError.message : 'Unknown error'
      });
    }
  } catch (error) {
    next(error);
  }
});

// Remove email from monitoring
router.delete('/:id', authenticateToken, requireBusiness, validateParams(emailParamsSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const emailId = req.params.id;

    // Get email info before deletion for logging
    const emailResult = await query(
      'SELECT email_address FROM monitored_emails WHERE id = $1 AND business_id = $2',
      [emailId, businessId]
    );

    if (emailResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const emailAddress = emailResult.rows[0].email_address;

    // Delete the email
    await query('DELETE FROM monitored_emails WHERE id = $1 AND business_id = $2', [emailId, businessId]);

    // Log the event
    await query(
      `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'email_removed', $2, $3, $4)`,
      [businessId, `Email address removed from monitoring: ${emailAddress}`, req.ip, req.get('User-Agent')]
    );

    res.json({ message: 'Email address removed from monitoring' });
  } catch (error) {
    next(error);
  }
});

// Get email monitoring statistics
router.get('/stats', authenticateToken, requireBusiness, async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;

    // Get total emails count
    const totalResult = await query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE business_id = $1',
      [businessId]
    );

    // Get connected emails count
    const connectedResult = await query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE business_id = $1 AND is_connected = true',
      [businessId]
    );

    // Get emails with recent activity (last 24 hours)
    const recentResult = await query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE business_id = $1 AND last_checked >= NOW() - INTERVAL \'24 hours\'',
      [businessId]
    );

    const stats = {
      totalEmails: parseInt(totalResult.rows[0].count),
      connectedEmails: parseInt(connectedResult.rows[0].count),
      disconnectedEmails: parseInt(totalResult.rows[0].count) - parseInt(connectedResult.rows[0].count),
      recentActivity: parseInt(recentResult.rows[0].count)
    };
    
    console.log('Email stats response:', stats);
    
    res.json({
      stats
    });
  } catch (error) {
    next(error);
  }
});

export default router;
