import { Router } from 'express';
import { validateBody } from '../middleware/validation.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { registerSchema, loginSchema, changePasswordSchema, resetPasswordSchema, googleAuthSchema, forgotPasswordSchema } from '../schemas/user.js';
import { createUser, verifyUserPassword, getUserById, generateToken, hashPassword, comparePassword, getUserByEmail, verifyGoogleToken } from '../utils/auth.js';
import { query } from '../../db/connection.js';
import crypto from 'node:crypto';
import { emailService } from '../services/emailService.js';
import { securityEventLogger } from '../utils/securityEventLogger.js';

const router = Router();

// Register new user
router.post('/register', authLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, businessName } = req.body;

    // Check if user already exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Check if business name already exists
    const existingBusiness = await query('SELECT id FROM businesses WHERE business_name = $1', [businessName]);
    if (existingBusiness.rows.length > 0) {
      return res.status(409).json({ error: 'A business with this name already exists' });
    }

    // Create user first
    const user = await createUser(email, password, firstName, lastName);

    // Create business for the user (owner_id links to user)
    const businessResult = await query(
      `INSERT INTO businesses (business_name, owner_id) 
       VALUES ($1, $2) 
       RETURNING id, business_name`,
      [businessName, user.id]
    );

    const business = businessResult.rows[0] as { id: number; business_name: string };
    const businessId = business.id;

    // Generate JWT token (business info comes from JOIN, but include in token for convenience)
    const token = generateToken({ ...user, business_name: business.business_name, business_id: businessId });

    // Set HTTP-only cookie for server-side authentication (same as login)
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        businessName: user.business_name,
        businessId
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

// Login user
router.post('/login', authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body as { email: string; password: string; rememberMe?: boolean };

    const user = await verifyUserPassword(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const tokenExpiry = rememberMe ? '30d' : '1d';
    const token = generateToken(user, tokenExpiry);

    // Set HTTP-only cookie for server-side authentication
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        businessName: user.business_name,
        businessId: user.business_id
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Google Identity Services login/signup
 * @route POST /api/auth/google
 * Body: { credential: string }
 * Verifies Google ID token, creates user+business if needed, sets auth cookie and returns user.
 */
router.post('/google', authLimiter, validateBody(googleAuthSchema), async (req, res, next) => {
  try {
    const { credential } = req.body;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ error: 'Google client not configured' });
    }

    const payload = await verifyGoogleToken(credential, clientId);
    if (!payload?.email) {
      return res.status(401).json({ error: 'Invalid Google credential' });
    }

    const email = payload.email;
    const firstName = (payload.given_name || '').trim() || 'User';
    const lastName = (payload.family_name || '').trim() || '';

    // Ensure user exists; create if not
    let user = await getUserByEmail(email);
    let businessId: number | undefined = user?.business_id;

    if (!user) {
      // Create user with a random password (unused for Google login)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      user = await createUser(email, randomPassword, firstName, lastName);

      // Create a business owned by this new user with NULL name
      // User will be prompted to enter business name on dashboard
      const businessResult = await query(
        `INSERT INTO businesses (business_name, owner_id) VALUES ($1, $2) RETURNING id, business_name`,
        [null, user.id]
      );
      const business = businessResult.rows[0] as { id: number; business_name: string | null };
      businessId = business.id;
      user = { ...user, business_id: businessId, business_name: business.business_name || undefined };
    } else if (!businessId) {
      // If the user exists but has no business_id resolved via LEFT JOIN, try to find owner's business
      const ownerBusiness = await query('SELECT id, business_name FROM businesses WHERE owner_id = $1 LIMIT 1', [user.id]);
      if (ownerBusiness.rows.length > 0) {
        const business = ownerBusiness.rows[0] as { id: number; business_name: string | null };
        businessId = business.id;
        user = { ...user, business_id: businessId, business_name: business.business_name || undefined };
      } else {
        // User exists but has no business - create one for them with NULL name
        // This handles edge case where user was created without a business
        const businessResult = await query(
          `INSERT INTO businesses (business_name, owner_id) VALUES ($1, $2) RETURNING id, business_name`,
          [null, user.id]
        );
        const business = businessResult.rows[0] as { id: number; business_name: string | null };
        businessId = business.id;
        // Update user object with business info (normally comes from JOIN)
        user = { ...user, business_id: businessId, business_name: business.business_name || undefined };
      }
    }

    // Generate token and set cookie (include business info if available)
    const token = generateToken({
      ...user,
      business_id: businessId,
      business_name: user.business_name
    });
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({
      message: 'Google login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        businessName: user.business_name,
        businessId: businessId
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

// Forgot password (initiate reset)
router.post('/forgot-password', authLimiter, validateBody(forgotPasswordSchema), async (req, res, next) => {
  try {
    const { email } = req.body;

    // Do not reveal whether user exists
    const lookup = await query('SELECT id FROM users WHERE email = $1', [email]);
    const userIdRow = (lookup.rows[0] as { id: number } | undefined);
    const user = userIdRow ? await getUserById(userIdRow.id) : null;

    if (user) {
      // Generate opaque single-use token (stored as hash) valid for 1 hour
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
      );

      const appUrl = process.env.FRONTEND_URL;
      const resetLink = `${appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

      // Send reset email (do not reveal success to the client)
      await emailService.sendPasswordReset(email, resetLink);
    }

    // Always return success
    return res.json({ message: 'If that account exists, a reset link has been sent.' });
  } catch (error) {
    next(error);
  }
});

// Reset password
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), async (req, res, next) => {
  try {
    const { token, newPassword } = req.body as { token: string; newPassword: string };
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Lookup token
    const tokenRes = await query(
      `SELECT prt.user_id, prt.expires_at, prt.used_at
       FROM password_reset_tokens prt
       WHERE prt.token_hash = $1
       ORDER BY prt.created_at DESC
       LIMIT 1`,
      [tokenHash]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const tokenRow = tokenRes.rows[0] as { user_id: number; expires_at: Date; used_at: Date | null };
    if (tokenRow.used_at) {
      return res.status(400).json({ error: 'This reset link has already been used' });
    }
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Reset link has expired' });
    }

    const userId = tokenRow.user_id;

    // Ensure new password is not the same as the current password
    const currentHashResult = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (currentHashResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const currentHash = (currentHashResult.rows[0] as { password_hash: string }).password_hash;
    const isSameAsOld = await comparePassword(newPassword, currentHash);
    if (isSameAsOld) {
      return res.status(400).json({ error: 'New password must be different from your previous password' });
    }

    const hashedNewPassword = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedNewPassword, userId]);

    // Mark token as used (single-use)
    await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1 AND used_at IS NULL', [tokenHash]);

    // Optionally log event
    await securityEventLogger.logSecurityEvent(
      userId,
      'password_reset',
      'User reset password'
    );

    return res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    next(error);
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const user = await getUserById(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        businessName: user.business_name,
        businessId: user.business_id
      }
    });
  } catch (error) {
    next(error);
  }
});

// Change password
router.post('/change-password', authenticateToken, validateBody(changePasswordSchema), async (req: AuthRequest, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    // Get current password hash
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, (result.rows[0] as { password_hash: string }).password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password
    const hashedNewPassword = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedNewPassword, userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    next(error);
  }
});

// Logout (client-side token removal, but we can log it)
router.post('/logout', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    // Log the logout event
    await securityEventLogger.logSecurityEvent(
      req.user!.business_id as number,
      'logout',
      'User logged out',
      {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    );

    // Clear the HTTP-only cookie
    res.clearCookie('authToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    res.json({ message: 'Logout successful' });
  } catch (error) {
    next(error);
  }
});

export default router;
