import { Router } from 'express';
import { authenticateToken, requireBusiness, type AuthRequest } from '../../middleware/auth.js';
import { validateBody, validateQuery } from '../../middleware/validation.js';
import { oauthLimiter } from '../../middleware/rateLimit.js';
import { query } from '../../../db/connection.js';
import { gmailOAuthService } from '../../services/oauth/gmail/GmailOAuthService.js';
import { oauthLogger } from '../../../utils/logger.js';
import { oauthAuthUrlSchema, oauthCallbackSchema } from '../../schemas/oauth.js';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { securityEventLogger } from '../../utils/securityEventLogger.js';

const router = Router();

const connectEmailSchema = z.object({
  emailAddress: z.string().email('Valid email address is required')
});
// utils/oauthHelpers.ts

export async function getTargetBusinessId(
  req: Request,
  res: Response,
  businessId?: number,
  approveToken?: string
): Promise<number | null> {
  if (businessId || approveToken) {
    if (!businessId) {
      res.status(400).json({ success: false, error: 'businessId is required when using approveToken' });
      return null;
    }
    return businessId;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return null;
  }

  const jwt = require('jsonwebtoken');
  try {
    const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET!) as { business_id: number };
    return decoded.business_id;
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, error: 'Invalid authentication token' });
      return null;
    }
    throw err; // unexpected
  }
}

export async function handleApprovalToken(
  req: Request,
  emailId: number,
  businessId: number,
  approveToken: string
): Promise<boolean> {
  const { tokenService } = await import('../../utils/tokenService.js');

  if (!tokenService.validateApprovalToken(approveToken, emailId, businessId)) {
    return false;
  }

  // Mark email as approved
  await query('UPDATE monitored_emails SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [emailId]);

  // Log the approval event
  const emailAddress = req.query.emailAddress;

  if (typeof emailAddress !== 'string') {
    throw new TypeError('Invalid emailAddress parameter, expected string');
  }
  
  await securityEventLogger.logSecurityEvent(
    businessId,
    'email_approved',
    `Email monitoring approved for: ${emailAddress}`,
    {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    }
  );

  return true;
}


/**
 * @route GET /api/oauth/gmail/auth-url
 * @desc Generate Gmail OAuth authorization URL
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
      const authUrl = gmailOAuthService.generateAuthUrl(targetBusinessId, emailAddress);
      res.redirect(authUrl);

    } catch (error) {
      oauthLogger.error(
        'Error generating Gmail OAuth URL',
        { operation: 'generate-auth-url', emailAddress, businessId },
        error as Error
      );
      next(error);
    }
  }
);


/**
 * @route GET /api/oauth/gmail/callback
 * @desc Handle Gmail OAuth callback from Google
 * @access Public (OAuth callback)
 */
router.get("/callback", oauthLimiter, validateQuery(oauthCallbackSchema), async (req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://numenorsecurity.com' : 'http://localhost:3000');
  try {
    const { code, state, error } = req.query;
    if (error) {

      let msg: string;

      if (error instanceof Error) {
        msg = error.message;
      } else if (typeof error === 'string') {
        msg = error;
      } else {
        msg = JSON.stringify(error, Object.getOwnPropertyNames(error));
      }
      return res.redirect(`${frontendUrl}/success?oauth_error=${msg}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}/success?oauth_error=missing_parameters`);
    }

    const stateData = JSON.parse(state as string);
    const { businessId, emailAddress } = stateData;

    // Exchange code for tokens
    const tokens = await gmailOAuthService.exchangeCodeForTokens(code as string);

    // Store tokens in database
    await gmailOAuthService.storeTokens(businessId, emailAddress, tokens);

    // Update monitored email timestamp (OAuth connected)
    await query(
      'UPDATE monitored_emails SET updated_at = CURRENT_TIMESTAMP WHERE business_id = $1 AND email_address = $2',
      [businessId, emailAddress]
    );

    // Set up Gmail watch for push notifications
    try {
      const watchResult = await gmailOAuthService.watchMailbox(businessId, emailAddress);
      oauthLogger.info('Gmail watch subscription created during OAuth callback', {
        operation: 'oauth-callback',
        businessId,
        emailAddress,
        metadata: {
          historyId: watchResult.historyId,
          expiration: watchResult.expiration.toISOString()
        }
      });
    } catch (watchError) {
      // Log error but don't fail the OAuth flow
      oauthLogger.error('Failed to create Gmail watch during OAuth callback', {
        operation: 'oauth-callback',
        businessId,
        emailAddress
      }, watchError as Error);
      // Continue - watch can be set up later via renewal scheduler
    }

    // Redirect to success page (no login required)
    res.redirect(`${frontendUrl}/success?email=${encodeURIComponent(emailAddress)}`);

  } catch (err) {
    if (err instanceof SyntaxError || err instanceof TypeError || err instanceof Error) {
      return res.redirect(`${frontendUrl}/success?oauth_error=invalid_state`);
    }
    throw err;
  }
});

/**
 * @route POST /api/oauth/gmail/disconnect
 * @desc Disconnect Gmail OAuth for an email
 * @access Private (Business users only)
 */
router.post('/disconnect', authenticateToken, requireBusiness, validateBody(connectEmailSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const { emailAddress } = req.body;

    // Stop Gmail watch before disconnecting
    try {
      await gmailOAuthService.stopWatch(businessId, emailAddress);
    } catch (watchError) {
      // Log but continue - watch may not exist
      oauthLogger.warn('Failed to stop Gmail watch during disconnect', {
        operation: 'disconnect-oauth',
        businessId,
        emailAddress
      }, {
        error: watchError instanceof Error ? {
          name: watchError.name,
          message: watchError.message,
          stack: watchError.stack
        } : String(watchError)
      });
    }

    // Remove OAuth tokens
    await gmailOAuthService.disconnect(businessId, emailAddress);

    // Update monitored email timestamp (OAuth disconnected)
    await query(
      'UPDATE monitored_emails SET updated_at = CURRENT_TIMESTAMP WHERE business_id = $1 AND email_address = $2',
      [businessId, emailAddress]
    );

    res.json({
      success: true,
      message: 'Gmail account disconnected successfully'
    });

  } catch (error) {
    oauthLogger.error('Error disconnecting Gmail OAuth', {
      operation: 'disconnect-oauth',
      businessId: req.user!.business_id!,
      emailAddress: req.body.emailAddress
    }, error as Error);
    next(error);
  }
});

/**
 * @route GET /api/oauth/gmail/status/:emailAddress
 * @desc Get Gmail OAuth connection status for an email
 * @access Private (Business users only)
 */
router.get('/status/:emailAddress', authenticateToken, requireBusiness, async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const emailAddress = req.params.emailAddress;

    const connectionStatus = await gmailOAuthService.getConnectionStatus(businessId, emailAddress);

    res.json({
      success: true,
      ...connectionStatus
    });

  } catch (error) {
    oauthLogger.error('Error checking Gmail OAuth status', {
      operation: 'check-oauth-status',
      businessId: req.user!.business_id!,
      emailAddress: req.params.emailAddress
    }, error as Error);
    next(error);
  }
});

/**
 * @route POST /api/oauth/gmail/test
 * @desc Test Gmail OAuth connection
 * @access Private (Business users only)
 */
router.post('/test', authenticateToken, requireBusiness, validateBody(connectEmailSchema), async (req: AuthRequest, res, next) => {
  try {
    const businessId = req.user!.business_id!;
    const { emailAddress } = req.body;

    const testResult = await gmailOAuthService.testConnection(businessId, emailAddress);

    if (testResult.success) {
      res.json(testResult);
    } else {
      res.status(400).json(testResult);
    }

  } catch (error) {
    oauthLogger.error('Error testing Gmail OAuth connection', {
      operation: 'test-oauth-connection',
      businessId: req.user!.business_id!,
      emailAddress: req.body.emailAddress
    }, error as Error);
    res.status(400).json({
      success: false,
      error: 'Gmail connection test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
