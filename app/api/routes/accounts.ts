import { Router } from 'express';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validation.js';
import { deleteAccountSchema } from '../schemas/user.js';
import { query } from '../../db/connection.js';
import { logger } from '../services/logger.js';

const router = Router();

/**
 * DELETE /api/accounts/:accountId
 * Permanently delete a user account and associated business
 * 
 * Security:
 * - Requires authentication (authenticateToken middleware)
 * - User can only delete their own account
 * - Rate limiting should be implemented server-side (e.g., express-rate-limit)
 * 
 * Body (optional):
 * - reason: string - Optional reason for leaving (stored privately for analytics)
 * 
 * Response:
 * - 200 OK: { status: "deleted", accountId: number, businessDeleted: boolean }
 * - 403 Forbidden: User cannot delete another user's account
 * - 404 Not Found: Account not found
 * - 500 Internal Server Error: Database error
 */
router.delete('/:accountId', authenticateToken, validateBody(deleteAccountSchema), async (req: AuthRequest, res, next) => {
  try {
    const accountId = parseInt(req.params.accountId, 10);
    const currentUserId = req.user!.id;
    const { reason } = req.body as { reason?: string };

    // Validate accountId
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'Invalid account ID' });
    }

    // Security: Users can only delete their own account
    if (accountId !== currentUserId) {
      return res.status(403).json({ error: 'You can only delete your own account' });
    }

    // Verify account exists and get business_id via JOIN
    const userResult = await query(
      `SELECT u.id, b.id as business_id 
       FROM users u
       LEFT JOIN businesses b ON b.owner_id = u.id
       WHERE u.id = $1`,
      [accountId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const user = userResult.rows[0] as { id: number; business_id: number | null };
    const businessId = user.business_id;

    // Get user and business details to preserve for analytics
    const userDetailsResult = await query(
      `SELECT u.email, u.first_name, u.last_name, b.name as business_name
       FROM users u
       LEFT JOIN businesses b ON b.owner_id = u.id
       WHERE u.id = $1`,
      [accountId]
    );
    
    const userDetails = userDetailsResult.rows[0] as {
      email: string;
      first_name: string;
      last_name: string;
      business_name: string | null;
    } | undefined;

    if (reason && reason.trim() && userDetails) {
      await query(
        `INSERT INTO account_deletions (user_email, user_name, business_name, reason, deleted_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          userDetails.email,
          `${userDetails.first_name} ${userDetails.last_name}`.trim(),
          userDetails.business_name || null,
          reason.trim()
        ]
      ).catch(() => {
        // Table might not exist - non-fatal, continue with deletion
        logger.warn('Could not store deletion reason (table may not exist)', {
          operation: 'account-deletion',
          userId: accountId
        });
      });
    }

    // Delete business first - CASCADE will automatically delete all related records:
    // - monitored_emails, phishing_alerts, email_scans, security_events, oauth_tokens,
    //   email_offsets, processed_emails (all have ON DELETE CASCADE foreign keys)
    let businessDeleted = false;
    if (businessId) {
      await query('DELETE FROM businesses WHERE id = $1', [businessId]);
      businessDeleted = true;
    }

    // Delete user account - CASCADE will automatically delete:
    // - password_reset_tokens (has ON DELETE CASCADE foreign key)
    // - businesses (if any remain, has ON DELETE CASCADE foreign key)
    await query('DELETE FROM users WHERE id = $1', [accountId]);

    // Log deletion event (without reason for privacy)
    logger.info('Account deleted', {
      operation: 'account-deletion',
      userId: accountId,
      businessId: businessId || undefined
    });

    res.json({
      status: 'deleted',
      accountId,
      businessDeleted
    });
  } catch (error) {
    logger.error('Failed to delete account', {
      operation: 'account-deletion',
      userId: req.user?.id
    }, error as Error);
    next(error);
  }
});

export default router;

