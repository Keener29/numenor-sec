import { Router } from 'express';
import { authenticateToken, requireBusiness, type AuthRequest } from '../../middleware/auth.js';
import { validateBody, validateQuery } from '../../middleware/validation.js';
import { oauthLimiter } from '../../middleware/rateLimit.js';
import { query } from '../../../db/connection.js';
import { gmailOAuthService } from '../../services/oauth/gmail/GmailOAuthService.js';
import { oauthLogger } from '../../services/logger.js';
import { oauthAuthUrlSchema, oauthCallbackSchema } from '../../schemas/oauth.js';
import { z } from 'zod';
import jwt from 'jsonwebtoken';

const router = Router();

const connectEmailSchema = z.object({
  emailAddress: z.string().email('Valid email address is required')
});

/**
 * @route GET /api/oauth/gmail/auth-url
 * @desc Generate Gmail OAuth authorization URL
 * @access Public (for email approval flow) or Private (for dashboard)
 */
router.get('/auth-url', oauthLimiter, validateQuery(oauthAuthUrlSchema), async (req, res, next) => {
  try {
    const { emailAddress, businessId, approveToken } = req.query;

    let targetBusinessId: number;

    // If businessId is provided (from email approval flow), use it
    if (businessId && typeof businessId === 'string') {
        targetBusinessId = parseInt(businessId as string);
    } else {
      // Otherwise, require authentication (from dashboard)
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      try {
        const token = authHeader.substring(7);
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { business_id: number };
        targetBusinessId = decoded.business_id;
      } catch (authError) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid authentication token' 
        });
      }
    }

    // Check if email is already monitored by this business
    const emailCheck = await query(
      'SELECT id FROM monitored_emails WHERE email_address = $1 AND business_id = $2',
      [emailAddress, targetBusinessId]
    );

    if (emailCheck.rows.length === 0) {
      return res.status(404).send('Email address not found in monitored emails. Please add it first.');
    }

    // If this is from email approval flow, validate the approval token
    if (approveToken && typeof approveToken === 'string') {
      const emailId = (emailCheck.rows[0] as { id: number }).id;
      
      // Validate the approval token
      const { tokenService } = await import('../../utils/tokenService.js');
      if (!tokenService.validateApprovalToken(approveToken, emailId, targetBusinessId)) {
        return res.status(403).send('Invalid or expired approval token');
      }

      // Mark email as approved (permission granted)
      await query(
        'UPDATE monitored_emails SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [emailId]
      );

      // Log the approval event
      await query(
        `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
         VALUES ($1, 'email_approved', $2, $3, $4)`,
        [targetBusinessId, `Email monitoring approved for: ${emailAddress}`, req.ip, req.get('User-Agent')]
      );
    }

    const authUrl = gmailOAuthService.generateAuthUrl(targetBusinessId, emailAddress as string);
    
    // Redirect directly to Google OAuth instead of returning JSON
    res.redirect(authUrl);

  } catch (error) {
    oauthLogger.error('Error generating Gmail OAuth URL', {
      operation: 'generate-auth-url',
      emailAddress: req.query.emailAddress as string,
      businessId: req.query.businessId ? parseInt(req.query.businessId as string) : undefined
    }, error as Error);
    next(error);
  }
});

/**
 * @route GET /api/oauth/gmail/callback
 * @desc Handle Gmail OAuth callback from Google
 * @access Public (OAuth callback)
 */
router.get("/callback", oauthLimiter, validateQuery(oauthCallbackSchema), async (req, res, next) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://numenorsecurity.com' : 'http://localhost:3000');
      return res.redirect(`${frontendUrl}/success?oauth_error=${error}`);
    }

    if (!code || !state) {
      const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://numenorsecurity.com' : 'http://localhost:3000');
      return res.redirect(`${frontendUrl}/success?oauth_error=missing_parameters`);
    }

    let stateData;
    try {
      stateData = JSON.parse(state as string);
    } catch (parseError) {
      const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://numenorsecurity.com' : 'http://localhost:3000');
      return res.redirect(`${frontendUrl}/success?oauth_error=invalid_state`);
    }

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

    // Redirect to success page (no login required)
    const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://numenorsecurity.com' : 'http://localhost:3000');
    res.redirect(`${frontendUrl}/success?email=${encodeURIComponent(emailAddress)}`);

  } catch (error) {
    oauthLogger.error('Error handling Gmail OAuth callback', {
      operation: 'oauth-callback',
      metadata: {
        code: req.query.code as string,
        state: req.query.state as string
      }
    }, error as Error);
    const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://numenorsecurity.com' : 'http://localhost:3000');
    res.redirect(`${frontendUrl}/success?oauth_error=callback_failed`);
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
