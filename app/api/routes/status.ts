import { Router } from 'express';
import { authenticateToken, requireBusiness, type AuthRequest } from '../middleware/auth.js';
import { gmailOAuthService } from '../services/oauth/gmail/GmailOAuthService.js';
import { oauthLogger } from '../../utils/logger.js';

const router = Router();

/**
 * @route GET /api/status/:emailAddress
 * @desc Get OAuth connection status for an email address
 * @access Private (Business users only)
 */
router.get('/:emailAddress', authenticateToken, requireBusiness, async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const emailAddress = decodeURIComponent(req.params.emailAddress);

    oauthLogger.info('Getting OAuth status for email', {
      operation: 'get-oauth-status',
      businessId,
      emailAddress
    });

    // For now, we only support Gmail OAuth, so we'll check Gmail status
    // In the future, this could be extended to check multiple providers
    const connectionStatus = await gmailOAuthService.getConnectionStatus(businessId, emailAddress);

    res.json({
      success: true,
      ...connectionStatus
    });

  } catch (error) {
    oauthLogger.error('Error checking OAuth status', {
      operation: 'get-oauth-status',
      businessId: req.user!.business_id!,
      emailAddress: req.params.emailAddress
    }, error as Error);
    next(error);
  }
});

export default router;
