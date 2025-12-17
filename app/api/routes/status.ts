import { Router } from 'express';
import { authenticateToken, requireBusiness, type AuthRequest } from '../middleware/auth.js';
import { gmailOAuthService } from '../services/oauth/gmail/GmailOAuthService.js';
import { outlookOAuthService } from '../services/oauth/outlook/OutlookOAuthService.js';
import { query } from '../../db/connection.js';
import { oauthLogger } from '../../utils/logger.js';
import type { OAuthConnectionStatus } from '../types/email.js';

const router = Router();

/**
 * @route GET /api/status/:emailAddress
 * @desc Get OAuth connection status for an email address (checks all providers)
 * @access Private (Business users only)
 * 
 * Checks both Gmail and Outlook providers and returns the status for whichever provider has tokens.
 * If multiple providers have tokens, returns the first one found (Gmail takes precedence).
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

    // Check which provider has tokens for this email
    const tokenResult = await query(
      'SELECT provider FROM oauth_tokens WHERE business_id = $1 AND email_address = $2 ORDER BY provider',
      [businessId, emailAddress]
    );

    let connectionStatus: OAuthConnectionStatus | null = null;

    if (tokenResult.rows.length > 0) {
      const providers = new Set<string>(
        tokenResult.rows.map(row => (row as { provider: string }).provider)
      );
      
      // Check Gmail first (for backward compatibility)
      if (providers.has('gmail')) {
        try {
          const gmailStatus = await gmailOAuthService.getConnectionStatus(businessId, emailAddress);
          connectionStatus = {
            ...gmailStatus,
            provider: gmailStatus.provider as 'gmail' | 'outlook' | 'yahoo'
          };
        } catch (error) {
          oauthLogger.warn('Failed to get Gmail OAuth status', {
            operation: 'get-oauth-status',
            businessId,
            emailAddress,
            metadata: { provider: 'gmail' }
          });
        }
      }
      
      // Check Outlook if Gmail didn't return a connection
      if (!connectionStatus?.isConnected && providers.has('outlook')) {
        try {
          const outlookStatus = await outlookOAuthService.getConnectionStatus(businessId, emailAddress);
          connectionStatus = {
            ...outlookStatus,
            provider: outlookStatus.provider as 'gmail' | 'outlook' | 'yahoo'
          };
        } catch (error) {
          oauthLogger.warn('Failed to get Outlook OAuth status', {
            operation: 'get-oauth-status',
            businessId,
            emailAddress,
            metadata: { provider: 'outlook' }
          });
        }
      }
    }

    // If no provider has tokens, return disconnected status
    if (!connectionStatus) {
      connectionStatus = {
        isConnected: false,
        connectedAt: null,
        provider: 'gmail' // Default provider for backward compatibility
      };
    }

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
