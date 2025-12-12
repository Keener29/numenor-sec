import { Router } from 'express';
import { validateParams } from '../middleware/validation.js';
import { authenticateToken, requireBusiness, type AuthRequest } from '../middleware/auth.js';
import { emailParamsSchema } from '../schemas/email.js';
import { query } from '../../db/connection.js';
import { emailService } from '../services/emailService.js';
import { emailLogger } from '../../utils/logger.js';
import { securityEventLogger } from '../utils/securityEventLogger.js';

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

    const emailAddress = (emailResult.rows[0] as { email_address: string }).email_address;

    // Get business name and owner email for the email
    const businessResult = await query(
      `SELECT b.business_name, u.email as owner_email 
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
      await emailService.sendPermissionRequest(businessName, emailAddress, businessEmail, Number.parseInt(emailId), businessId);
      
      // Log successful email send
      await securityEventLogger.logSecurityEvent(
      businessId,
      'permission_email_resent',
      `Permission request email resent to: ${emailAddress}`,
      {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    );

      res.json({
        message: 'Permission request email resent successfully',
        emailAddress: emailAddress
      });
    } catch (emailError) {
      // Log email send failure
      emailLogger.error('Failed to resend permission request email', {
        operation: 'resend-permission-email',
        businessId,
        emailAddress
      }, emailError as Error);
      await securityEventLogger.logSecurityEvent(
        businessId,
        'permission_email_resend_failed',
        `Failed to resend permission request email to: ${emailAddress} - ${emailError instanceof Error ? emailError.message : 'Unknown error'}`,
        {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
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

    // Get connected emails (those with OAuth tokens)
    const connectedEmailsResult = await query(
      `SELECT COUNT(*) as count 
       FROM monitored_emails me
       INNER JOIN oauth_tokens ot ON me.business_id = ot.business_id AND me.email_address = ot.email_address
       WHERE me.business_id = $1`,
      [businessId]
    );

    // Get disconnected emails (those without OAuth tokens)
    const disconnectedEmailsResult = await query(
      `SELECT COUNT(*) as count 
       FROM monitored_emails me
       LEFT JOIN oauth_tokens ot ON me.business_id = ot.business_id AND me.email_address = ot.email_address
       WHERE me.business_id = $1 AND ot.id IS NULL`,
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
      totalEmails: Number.parseInt((totalEmailsResult.rows[0] as { count: string }).count),
      connectedEmails: Number.parseInt((connectedEmailsResult.rows[0] as { count: string }).count),
      disconnectedEmails: Number.parseInt((disconnectedEmailsResult.rows[0] as { count: string }).count),
      recentActivity: Number.parseInt((recentActivityResult.rows[0] as { count: string }).count)
    };

    res.json({ stats });
  } catch (error) {
    next(error);
  }
});

export default router;
