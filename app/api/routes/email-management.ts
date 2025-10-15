import { Router } from 'express';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import { authenticateToken, requireBusiness, type AuthRequest } from '../middleware/auth.js';
import { addEmailSchema, updateEmailSchema, emailParamsSchema, emailQuerySchema } from '../schemas/email.js';
import { query } from '../../db/connection.js';
import { emailService } from '../services/emailService.js';
import { emailLogger } from '../services/logger.js';

const router = Router();

// Get all monitored emails for the business
router.get('/', authenticateToken, requireBusiness, validateQuery(emailQuerySchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const { page, limit, connected } = req.query as { page?: string; limit?: string; connected?: string };

    const pageNum = parseInt(page || '1');
    const limitNum = parseInt(limit || '10');
    const offset = (pageNum - 1) * limitNum;
    let whereClause = 'WHERE business_id = $1';
    const queryParams = [businessId];

    // connected refers to the connection status of a monitored email address 
    // if connected is true, only show emails that are connected
    // if connected is false, only show emails that are not connected
    // if connected is undefined, show all emails
    // For now, we'll ignore the connected filter since we removed is_connected

    // Get emails with pagination
    const emailsResult = await query(
      `SELECT id, email_address, last_checked, created_at, updated_at
       FROM monitored_emails 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, limitNum, offset]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as count FROM monitored_emails ${whereClause}`,
      queryParams
    );

    const totalCount = parseInt((countResult.rows[0] as { count: string }).count);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      emails: (emailsResult.rows as { id: number; email_address: string; last_checked: Date | null; created_at: Date; updated_at: Date }[]).map((email) => ({
        id: email.id,
        emailAddress: email.email_address,
        isConnected: false, // Will be determined by OAuth status check on frontend
        lastChecked: email.last_checked,
        createdAt: email.created_at,
        updatedAt: email.updated_at
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// Add a new monitored email
router.post('/', authenticateToken, requireBusiness, validateBody(addEmailSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const { emailAddress } = req.body;
    
    emailLogger.info('Adding new email for monitoring', {
      operation: 'add-email',
      businessId,
      emailAddress
    });

    // Check if email already exists for this business
    const existingEmail = await query(
      'SELECT id FROM monitored_emails WHERE email_address = $1 AND business_id = $2',
      [emailAddress, businessId]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ error: 'Email address is already being monitored' });
    }

    // Insert new email
    const result = await query(
      `INSERT INTO monitored_emails (business_id, email_address)
       VALUES ($1, $2)
       RETURNING id, email_address, last_checked, created_at, updated_at`,
      [businessId, emailAddress]
    );

    const email = result.rows[0] as { id: number; email_address: string; last_checked: Date | null; created_at: Date; updated_at: Date };

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

    const businessName = (businessResult.rows[0] as { name: string }).name;
    const businessEmail = (businessResult.rows[0] as { owner_email: string }).owner_email;

    // Send permission request email
    try {
      await emailService.sendPermissionRequest(businessName, emailAddress, businessEmail, (email as { id: number }).id, businessId);
      
      // Log successful email send
      await query(
        `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
         VALUES ($1, 'permission_email_sent', $2, $3, $4)`,
        [businessId, `Permission request email sent to: ${emailAddress}`, req.ip, req.get('User-Agent')]
      );

      res.status(201).json({
        message: 'Email added successfully and permission request sent',
        email: {
          id: email.id,
          emailAddress: email.email_address,
          isConnected: false, // Will be determined by OAuth status check on frontend
          lastChecked: email.last_checked,
          createdAt: email.created_at,
          updatedAt: email.updated_at
        }
      });
    } catch (emailError) {
      // Log email send failure
      emailLogger.error('Failed to send permission request email', {
        operation: 'send-permission-email',
        businessId,
        emailAddress
      }, emailError as Error);
      await query(
        `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
         VALUES ($1, 'permission_email_failed', $2, $3, $4)`,
        [businessId, `Failed to send permission request email to: ${emailAddress} - ${emailError instanceof Error ? emailError.message : 'Unknown error'}`, req.ip, req.get('User-Agent')]
      );

      res.status(201).json({
        message: 'Email added successfully but failed to send permission request',
        email: {
          id: email.id,
          emailAddress: email.email_address,
          isConnected: false, // Will be determined by OAuth status check on frontend
          lastChecked: email.last_checked,
          createdAt: email.created_at,
          updatedAt: email.updated_at
        },
        warning: 'Permission request email could not be sent. Please try resending from the dashboard.'
      });
    }
  } catch (error) {
    next(error);
  }
});

// Update an existing monitored email
router.put('/:id', authenticateToken, requireBusiness, validateParams(emailParamsSchema), validateBody(updateEmailSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const emailId = req.params.id;
    const { emailAddress, isConnected } = req.body;

    // Check if email exists and belongs to this business
    const existingEmail = await query(
      'SELECT id, email_address FROM monitored_emails WHERE id = $1 AND business_id = $2',
      [emailId, businessId]
    );

    if (existingEmail.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const existingEmailData = existingEmail.rows[0] as { id: number; email_address: string };

    // Check if new email address already exists for this business (if changing email)
    if (emailAddress && emailAddress !== existingEmailData.email_address) {
      const duplicateEmail = await query(
        'SELECT id FROM monitored_emails WHERE email_address = $1 AND business_id = $2 AND id != $3',
        [emailAddress, businessId, emailId]
      );

      if (duplicateEmail.rows.length > 0) {
        return res.status(409).json({ error: 'Email address is already being monitored' });
      }
    }

    // Update email
    const result = await query(
      `UPDATE monitored_emails 
       SET email_address = COALESCE($1, email_address), 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND business_id = $3
       RETURNING id, email_address, last_checked, created_at, updated_at`,
      [emailAddress, emailId, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const email = result.rows[0] as { id: number; email_address: string; last_checked: Date | null; created_at: Date; updated_at: Date };

    // Log the update
    await query(
      `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'email_updated', $2, $3, $4)`,
      [businessId, `Email monitoring updated for: ${email.email_address}`, req.ip, req.get('User-Agent')]
    );

    res.json({
      message: 'Email updated successfully',
      email: {
        id: email.id,
        emailAddress: email.email_address,
        isConnected: false, // Will be determined by OAuth status check on frontend
        lastChecked: email.last_checked,
        createdAt: email.created_at,
        updatedAt: email.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete a monitored email
router.delete('/:id', authenticateToken, requireBusiness, validateParams(emailParamsSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const emailId = req.params.id;

    // Get email info before deletion for logging
    const emailResult = await query(
      'SELECT id, email_address FROM monitored_emails WHERE id = $1 AND business_id = $2',
      [emailId, businessId]
    );

    if (emailResult.rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const emailData = emailResult.rows[0] as { id: number; email_address: string };
    const emailAddress = emailData.email_address;

    // Disconnect OAuth tokens before deleting the email
    try {
      // Check if there are OAuth tokens for this email
      const oauthResult = await query(
        'SELECT provider FROM oauth_tokens WHERE business_id = $1 AND email_address = $2',
        [businessId, emailAddress]
      );
      
      if (oauthResult.rows.length > 0) {
        // Disconnect OAuth tokens
        await query(
          'DELETE FROM oauth_tokens WHERE business_id = $1 AND email_address = $2',
          [businessId, emailAddress]
        );
      }
    } catch (oauthError) {
      // Log OAuth cleanup error but don't fail the email deletion
      console.error('Failed to cleanup OAuth tokens during email deletion:', oauthError);
    }

    // Delete the email
    await query('DELETE FROM monitored_emails WHERE id = $1 AND business_id = $2', [emailId, businessId]);

    // Log the deletion
    await query(
      `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'email_deleted', $2, $3, $4)`,
      [businessId, `Email monitoring and OAuth connection removed for: ${emailAddress}`, req.ip, req.get('User-Agent')]
    );

    res.json({
      message: 'Email removed from monitoring successfully',
      emailAddress: emailAddress
    });
  } catch (error) {
    next(error);
  }
});

export default router;
