import { Router } from 'express';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.js';
import { authenticateToken, requireBusiness, type AuthRequest } from '../middleware/auth.js';
import { addEmailSchema, addBulkEmailsSchema, updateEmailSchema, emailParamsSchema, emailQuerySchema } from '../schemas/email.js';
import { query, getClient } from '../../db/connection.js';
import { emailService } from '../services/emailService.js';
import { emailLogger } from '../../utils/logger.js';
import type { MonitoredEmail } from '../types/email.js';
import { securityEventLogger } from '../utils/securityEventLogger.js';
import { getOAuthProvider } from '../utils/emailUtils.js';
import { gmailOAuthService } from '../services/oauth/gmail/GmailOAuthService.js';
import { outlookOAuthService } from '../services/oauth/outlook/OutlookOAuthService.js';
import { microsoftSubscriptionService } from '../services/oauth/outlook/MicrosoftSubscriptionService.js';
import { oauthLogger } from '../../utils/logger.js';

const router = Router();

/**
 * Remove email subscription for microsoft
 * Deletes Microsoft Graph subscription via API
 */
async function removeMicrosoftSubscription(
  businessId: number,
  emailAddress: string
): Promise<void> {
  const context = {
    operation: 'remove-subscription',
    businessId,
    emailAddress,
  };
  // For Outlook, get tokens and delete subscription via Graph API
  const tokens = await outlookOAuthService.getTokens(businessId, emailAddress);
  if (tokens) {
    try {
      await microsoftSubscriptionService.deleteSubscription(
        businessId,
        emailAddress,
        tokens.accessToken,
        context
      );
      oauthLogger.info('Microsoft subscription removed successfully', context);
    } catch (error) {
      oauthLogger.warn('Failed to delete Microsoft subscription via API', context, { message: (error as Error).message });
      // Continue - subscription might already be deleted or expired
    }
  } else {
    oauthLogger.debug('No OAuth tokens found for Microsoft subscription removal', context);
  }
}

/**
 * Remove email subscription for Gmail
 * Stops Gmail watch subscription (pub/sub)
 */
async function removeGmailSubscription(
  businessId: number,
  emailAddress: string
): Promise<void> {
  const context = {
    operation: 'remove-subscription',
    businessId,
    emailAddress,
  };
  try {
    await gmailOAuthService.stopWatch(businessId, emailAddress);
    oauthLogger.info('Gmail watch subscription stopped successfully', context);
  } catch (error) {
    oauthLogger.warn('Failed to stop Gmail watch subscription', context, { message: (error as Error).message });
    // Continue - watch might already be stopped or expired
  }
}

// Get all monitored emails for the business
router.get('/', authenticateToken, requireBusiness, validateQuery(emailQuerySchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const { page, limit } = req.query as { page?: string; limit?: string; connected?: string };

    const pageNum = Number.parseInt(page || '1');
    const limitNum = Number.parseInt(limit || '10');
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

    const totalCount = Number.parseInt((countResult.rows[0] as { count: string }).count);
    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      emails: (emailsResult.rows as { id: number; email_address: string; last_checked: Date | null; created_at: Date; updated_at: Date }[]).map((email) => ({
        id: email.id,
        emailAddress: email.email_address,
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

    // Check if email is Gmail (only Gmail is supported)
    const oauthProvider = await getOAuthProvider(emailAddress);
    if (oauthProvider !== 'gmail' && oauthProvider !== 'microsoft') {
      return res.status(400).json({ 
        error: 'Only Gmail/Outlook accounts are currently supported for email monitoring' 
      });
    }

    // Check if email already exists for any business
    const existingEmail = await query(
      'SELECT id FROM monitored_emails WHERE email_address = $1',
      [emailAddress]
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
      `SELECT b.business_name, u.email as owner_email 
       FROM businesses b 
       JOIN users u ON b.owner_id = u.id 
       WHERE b.id = $1`,
      [businessId]
    );

    if (businessResult.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const businessName = (businessResult.rows[0] as { business_name: string }).business_name;
    const businessEmail = (businessResult.rows[0] as { owner_email: string }).owner_email;

    // Send permission request email
    try {
      await emailService.sendPermissionRequest(businessName, emailAddress, businessEmail, (email as { id: number }).id, businessId);
      
      // Log successful email send
      await securityEventLogger.logSecurityEvent(
        businessId,
        'permission_email_sent',
        `Permission request email sent to: ${emailAddress}`,
        {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      res.status(201).json({
        message: 'Email added successfully and permission request sent',
        email: {
          id: email.id,
          emailAddress: email.email_address,
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
      await securityEventLogger.logSecurityEvent(
        businessId,
        'permission_email_failed',
        `Failed to send permission request email to: ${emailAddress} - ${emailError instanceof Error ? emailError.message : 'Unknown error'}`,
        {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      res.status(201).json({
        status: 'partial_success',
        message: 'Email added successfully but failed to send permission request',
        email: {
          id: email.id,
          emailAddress: email.email_address,
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

// bulk email send helper
const bulkEmailSendHelper = async (insertedEmails: MonitoredEmail[], businessId: number, businessName: string, businessEmail: string, ip: string | undefined, userAgent: string | undefined) => {
  const emailResults: Array<{ email: string; success: boolean; error?: string }> = [];
  for (const email of insertedEmails) {
    try {
      await emailService.sendPermissionRequest(
        businessName, 
        email.emailAddress, 
        businessEmail, 
        email.id, 
        businessId
      );
      
      // Log successful email send
      await securityEventLogger.logSecurityEvent(
        businessId,
        'permission_email_sent',
        `Permission request email sent to: ${email.emailAddress}`,
        {
          ipAddress: ip,
          userAgent: userAgent
        }
      );
      
      emailResults.push({ email: email.emailAddress, success: true });
    } catch (emailError) {
      // Log email send failure
      emailLogger.error('Failed to send permission request email', {
        operation: 'send-permission-email',
        businessId,
        emailAddress: email.emailAddress
      }, emailError as Error);
      
      await securityEventLogger.logSecurityEvent(
        businessId,
        'permission_email_failed',
        `Failed to send permission request email to: ${email.emailAddress} - ${emailError instanceof Error ? emailError.message : 'Unknown error'}`,
        {
          ipAddress: ip,
          userAgent: userAgent
        }
      );
      
      emailResults.push({ 
        email: email.emailAddress, 
        success: false, 
        error: emailError instanceof Error ? emailError.message : 'Unknown error' 
      });
    }
  }
  return emailResults;
};

// Add multiple monitored emails (bulk)
router.post('/bulk', authenticateToken, requireBusiness, validateBody(addBulkEmailsSchema), async (req: AuthRequest, res, next) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    const businessId = req.user!.business_id!;
    const { emailAddresses } = req.body;
    
    // Normalize emails to lowercase and remove duplicates
    const normalizedEmails: string[] = [...new Set((emailAddresses as string[]).map((email: string) => email.toLowerCase().trim()))];
    
    emailLogger.info('Adding bulk emails for monitoring', {
      operation: 'add-bulk-emails',
      businessId
    });

    // Validate that all emails are Gmail (only Gmail is supported)
    const invalidEmails: string[] = [];
    for (const email of normalizedEmails) {
      const oauthProvider = await getOAuthProvider(email);
      if (oauthProvider !== 'gmail') {
        invalidEmails.push(email);
      }
    }

    if (invalidEmails.length > 0) {
      return res.status(400).json({ 
        error: 'Only Gmail accounts are currently supported for email monitoring',
        invalidEmails
      });
    }

    // Get business info once
    const businessResult = await client.query(
      `SELECT b.business_name, u.email as owner_email 
       FROM businesses b 
       JOIN users u ON b.owner_id = u.id 
       WHERE b.id = $1`,
      [businessId]
    );

    if (businessResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Business not found' });
    }

    const businessName = (businessResult.rows[0] as { business_name: string }).business_name;
    const businessEmail = (businessResult.rows[0] as { owner_email: string }).owner_email;

    // Check for existing emails in bulk (using parameterized query for security)
    // Build safe parameterized query - emails are already validated and normalized
    const emailPlaceholders = normalizedEmails.map((_, i) => `$${i + 1}`).join(', ');
    const existingEmailsResult = await client.query(
      `SELECT email_address FROM monitored_emails 
       WHERE email_address IN (${emailPlaceholders}) AND business_id = $${normalizedEmails.length + 1}`,
      [...normalizedEmails, businessId]
    );

    const existingEmails = new Set(
      (existingEmailsResult.rows as { email_address: string }[]).map(row => row.email_address.toLowerCase())
    );

    // Filter out existing emails
    const newEmails = normalizedEmails.filter((email: string) => !existingEmails.has(email));

    if (newEmails.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        error: 'All email addresses are already being monitored',
        duplicates: normalizedEmails
      });
    }

    // Check current count to enforce limit
    const countResult = await client.query(
      'SELECT COUNT(*) as count FROM monitored_emails WHERE business_id = $1',
      [businessId]
    );
    const currentCount = Number.parseInt((countResult.rows[0] as { count: string }).count);
    const MAX_EMAILS = 5;
    
    if (currentCount + newEmails.length > MAX_EMAILS) {
      await client.query('ROLLBACK');
      const availableSlots = MAX_EMAILS - currentCount;
      return res.status(400).json({ 
        error: `Cannot add ${newEmails.length} email(s). Only ${availableSlots} slot(s) available. Maximum ${MAX_EMAILS} emails allowed.`,
        availableSlots,
        requested: newEmails.length
      });
    }

    // Insert all new emails
    const insertedEmails: MonitoredEmail[] = [];
    
    for (const emailAddress of newEmails) {
      const result = await client.query(
        `INSERT INTO monitored_emails (business_id, email_address)
         VALUES ($1, $2)
         RETURNING id, email_address, last_checked, created_at, updated_at`,
        [businessId, emailAddress]
      );
      insertedEmails.push({
        id: result.rows[0].id,
        businessId: result.rows[0].business_id,
        emailAddress: result.rows[0].email_address,
        lastChecked: result.rows[0].last_checked,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at
      });
    }

    await client.query('COMMIT');

    // Send permission request emails (non-blocking, failures don't affect the response)    
    const emailResults = await bulkEmailSendHelper(insertedEmails, businessId, businessName, businessEmail, req.ip, req.get('User-Agent'));

    const successfulEmails = emailResults.filter(r => r.success);
    const failedEmails = emailResults.filter(r => !r.success);

    res.status(201).json({
      message: `Successfully added ${insertedEmails.length} email(s)`,
      emails: insertedEmails.map(email => ({
        id: email.id,
        emailAddress: email.emailAddress,
        lastChecked: email.lastChecked,
        createdAt: email.createdAt,
        updatedAt: email.updatedAt
      })),
      summary: {
        total: normalizedEmails.length,
        added: insertedEmails.length,
        duplicates: normalizedEmails.length - newEmails.length,
        permissionEmailsSent: successfulEmails.length,
        permissionEmailsFailed: failedEmails.length
      },
      duplicates: normalizedEmails.filter(email => existingEmails.has(email)),
      permissionEmailResults: emailResults,
      warnings: failedEmails.length > 0 
        ? [`Failed to send permission request emails to ${failedEmails.length} address(es). Please try resending from the dashboard.`]
        : []
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    if (client) client.release();
  }
});

// Update an existing monitored email
router.put('/:id', authenticateToken, requireBusiness, validateParams(emailParamsSchema), validateBody(updateEmailSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const emailId = req.params.id;
    const { emailAddress } = req.body;

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
        'SELECT id FROM monitored_emails WHERE email_address = $1 AND id != $2',
        [emailAddress, emailId]
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
    await securityEventLogger.logSecurityEvent(
      businessId,
      'email_updated',
      `Email monitoring updated for: ${email.email_address}`,
      {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    );

    res.json({
      message: 'Email updated successfully',
      email: {
        id: email.id,
        emailAddress: email.email_address,
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

    // Remove subscriptions and OAuth tokens before deleting the email
    try {
      // Check if there are OAuth tokens for this email to determine provider
      const oauthResult = await query(
        'SELECT provider FROM oauth_tokens WHERE business_id = $1 AND email_address = $2',
        [businessId, emailAddress]
      );
      
      if (oauthResult.rows.length > 0) {
        const provider = (oauthResult.rows[0] as { provider: string }).provider as 'gmail' | 'microsoft';
        
        // Remove subscription based on provider
        if (provider === 'gmail'){
          await removeGmailSubscription(businessId, emailAddress);
        } else {
          await removeMicrosoftSubscription(businessId, emailAddress);
        }

        // Delete OAuth tokens from database AFTER subscription removal
        await query(
          'DELETE FROM oauth_tokens WHERE business_id = $1 AND email_address = $2',
          [businessId, emailAddress]
        );
      }
    } catch (oauthError) {
      // Log OAuth cleanup error but don't fail the email deletion
      emailLogger.error('Failed to cleanup OAuth tokens/subscriptions during email deletion', {
        operation: 'delete-email-cleanup',
        businessId,
        emailAddress
      }, oauthError as Error);
    }

    // Delete the email
    await query('DELETE FROM monitored_emails WHERE id = $1 AND business_id = $2', [emailId, businessId]);

    // Log the deletion
    await securityEventLogger.logSecurityEvent(
      businessId,
      'email_deleted',
      `Email monitoring and OAuth connection removed for: ${emailAddress}`,
      {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
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
