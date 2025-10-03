import { Router } from 'express';
import { validateParams } from '../middleware/validation.js';
import { authenticateToken, requireBusiness, type AuthRequest } from '../middleware/auth.js';
import { emailParamsSchema } from '../schemas/email.js';
import { query } from '../../db/connection.js';
import { emailService } from '../utils/emailService.js';

const router = Router();

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
      await emailService.sendPermissionRequest(businessName, emailAddress, businessEmail, parseInt(emailId), businessId);
      
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

// Get email monitoring statistics
router.get('/stats', authenticateToken, requireBusiness, async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;

    // Get total emails
    const totalEmailsResult = await query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE business_id = $1',
      [businessId]
    );

    // Get connected emails
    const connectedEmailsResult = await query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE business_id = $1 AND is_connected = true',
      [businessId]
    );

    // Get disconnected emails
    const disconnectedEmailsResult = await query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE business_id = $1 AND is_connected = false',
      [businessId]
    );

    // Get recent activity (last 7 days)
    const recentActivityResult = await query(
      `SELECT COUNT(*) as count 
       FROM security_events 
       WHERE business_id = $1 
       AND created_at >= NOW() - INTERVAL '7 days'`,
      [businessId]
    );

    const stats = {
      totalEmails: parseInt(totalEmailsResult.rows[0].count),
      connectedEmails: parseInt(connectedEmailsResult.rows[0].count),
      disconnectedEmails: parseInt(disconnectedEmailsResult.rows[0].count),
      recentActivity: parseInt(recentActivityResult.rows[0].count)
    };

    res.json({ stats });
  } catch (error) {
    next(error);
  }
});

export default router;
