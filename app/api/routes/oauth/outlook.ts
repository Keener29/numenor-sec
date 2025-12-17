import { Router } from 'express';
import { authenticateToken, requireBusiness, type AuthRequest } from '../../middleware/auth.js';
import { validateBody, validateQuery } from '../../middleware/validation.js';
import { oauthLimiter } from '../../middleware/rateLimit.js';
import { query } from '../../../db/connection.js';
import { outlookOAuthService } from '../../services/oauth/outlook/OutlookOAuthService.js';
import { oauthLogger } from '../../../utils/logger.js';
import { oauthAuthUrlSchema, oauthCallbackSchema } from '../../schemas/oauth.js';
import { z } from 'zod';
import { securityEventLogger } from '../../utils/securityEventLogger.js';
import { getTargetBusinessId, handleApprovalToken, handleOAuthCallbackError } from '../../utils/oauthUtils.js';
import { validateOAuthState } from '../../services/oauth/base/stateValidation.js';

const router = Router();

const connectEmailSchema = z.object({
  emailAddress: z.string().email('Valid email address is required')
});

/**
 * @route GET /api/oauth/outlook/auth-url
 * @desc Generate Outlook OAuth authorization URL
 * @access Public (email approval flow) or Private (dashboard)
 */
router.get(
  '/auth-url',
  oauthLimiter,
  validateQuery(oauthAuthUrlSchema),
  async (req, res, next) => {
    const emailAddress = req.query.emailAddress as string;
    const businessId = req.query.businessId as number | undefined;
    const approveToken = req.query.approveToken as string | undefined;

    try {
      const targetBusinessId = await getTargetBusinessId(req, res, businessId, approveToken);
      if (!targetBusinessId) return; // already responded inside helper

      // Verify email exists
      const { rows: emailRows } = await query(
        'SELECT id FROM monitored_emails WHERE email_address = $1 AND business_id = $2',
        [emailAddress, targetBusinessId]
      );
      if (!emailRows.length) {
        return res.status(404).send('Email address not found in monitored emails. Please add it first.');
      }
      const emailId = (emailRows[0] as { id: number }).id;

      // Handle approval token if present
      if (approveToken) {
        const valid = await handleApprovalToken(req, emailId, targetBusinessId, approveToken);
        if (!valid) return res.status(403).send('Invalid or expired approval token');
      }

      // Generate OAuth URL and redirect
      const authUrl = await outlookOAuthService.generateAuthUrl(targetBusinessId, emailAddress);
      res.redirect(authUrl);

    } catch (error) {
      oauthLogger.error(
        'Error generating Outlook OAuth URL',
        { operation: 'generate-auth-url', emailAddress, businessId },
        error as Error
      );
      next(error);
    }
  }
);

/**
 * @route GET /api/oauth/outlook/callback
 * @desc Handle Outlook OAuth callback from Microsoft
 * @access Public (OAuth callback)
 */
router.get("/callback", oauthLimiter, validateQuery(oauthCallbackSchema), async (req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL;
  try {
    const { code, state, error } = req.query;
    
    // Handle OAuth callback error
    const errorRedirectUrl = await handleOAuthCallbackError(error, state as string | undefined, req, frontendUrl || '', 'outlook');
    if (errorRedirectUrl) {
      return res.redirect(errorRedirectUrl);
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}/success?oauth_error=missing_parameters`);
    }

    // SECURITY: Validate and parse signed state (prevents tampering)
    const stateData = await validateOAuthState(state as string, 'outlook');
    const { businessId, emailAddress } = stateData;

    // Exchange code for tokens
    const tokens = await outlookOAuthService.exchangeCodeForTokens(code as string);

    // Store tokens in database (this also creates the subscription)
    await outlookOAuthService.storeTokens(businessId, emailAddress, tokens);

    // Update monitored email timestamp (OAuth connected)
    await query(
      'UPDATE monitored_emails SET updated_at = CURRENT_TIMESTAMP WHERE business_id = $1 AND email_address = $2',
      [businessId, emailAddress]
    );

    // Log successful OAuth connection
    await securityEventLogger.logSecurityEvent(
      businessId,
      'oauth_connected',
      `Outlook OAuth connected for: ${emailAddress}`,
      {
        provider: 'outlook',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    );

    oauthLogger.info('Outlook OAuth connection completed', {
      operation: 'oauth-callback',
      businessId,
      emailAddress
    });

    // Redirect to success page (no login required)
    res.redirect(`${frontendUrl}/success?email=${encodeURIComponent(emailAddress)}`);

  } catch (err) {
    // State validation errors are handled by validateOAuthState
    // Log security event if we can extract business info from error
    if (err instanceof Error && err.message.includes('OAuth state')) {
      try {
        // Try to extract state info for logging (if state exists but is invalid)
        if (req.query.state) {
          const stateStr = req.query.state as string;
          // Try to parse as unsigned JSON for logging purposes
          try {
            const stateData = JSON.parse(stateStr);
            if (stateData.businessId && stateData.emailAddress) {
              await securityEventLogger.logSecurityEvent(
                stateData.businessId,
                'oauth_failed',
                `Outlook OAuth connection failed - invalid state for: ${stateData.emailAddress}`,
                {
                  error: err.message,
                  ipAddress: req.ip,
                  userAgent: req.get('User-Agent')
                }
              );
            }
          } catch {
            // State couldn't be parsed - skip logging
          }
        }
      } catch (logError) {
        // Don't fail the redirect if logging fails
        oauthLogger.warn('Failed to log OAuth failure event', {
          operation: 'oauth-callback-logging'
        }, {
          error: logError instanceof Error ? logError.message : String(logError)
        });
      }
    }
    return res.redirect(`${frontendUrl}/success?oauth_error=invalid_state`);
  }
});

/**
 * @route POST /api/oauth/outlook/disconnect
 * @desc Disconnect Outlook OAuth for an email
 * @access Private (Business users only)
 */
router.post('/disconnect', authenticateToken, requireBusiness, validateBody(connectEmailSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const { emailAddress } = req.body;

    // Disconnect OAuth (this also deletes the subscription)
    await outlookOAuthService.disconnect(businessId, emailAddress);

    // Update monitored email timestamp (OAuth disconnected)
    await query(
      'UPDATE monitored_emails SET updated_at = CURRENT_TIMESTAMP WHERE business_id = $1 AND email_address = $2',
      [businessId, emailAddress]
    );

    // Log OAuth disconnection
    await securityEventLogger.logSecurityEvent(
      businessId,
      'oauth_disconnected',
      `Outlook OAuth disconnected for: ${emailAddress}`,
      {
        provider: 'outlook',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    );

    res.json({
      success: true,
      message: 'Outlook account disconnected successfully'
    });

  } catch (error) {
    oauthLogger.error('Error disconnecting Outlook OAuth', {
      operation: 'disconnect-oauth',
      businessId: req.user!.business_id!,
      emailAddress: req.body.emailAddress
    }, error as Error);
    next(error);
  }
});

/**
 * @route POST /api/oauth/outlook/test
 * @desc Test Outlook OAuth connection
 * @access Private (Business users only)
 */
router.post('/test', authenticateToken, requireBusiness, validateBody(connectEmailSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const { emailAddress } = req.body;

    const testResult = await outlookOAuthService.testConnection(businessId, emailAddress);

    if (testResult.success) {
      res.json(testResult);
    } else {
      res.status(400).json(testResult);
    }

  } catch (error) {
    oauthLogger.error('Error testing Outlook OAuth connection', {
      operation: 'test-oauth-connection',
      businessId: req.user!.business_id!,
      emailAddress: req.body.emailAddress
    }, error as Error);
    res.status(400).json({
      success: false,
      error: 'Outlook connection test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;

