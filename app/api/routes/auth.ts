import { Router } from 'express';
import { validateBody } from '../middleware/validation.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { registerSchema, loginSchema, changePasswordSchema, resetPasswordSchema } from '../schemas/user.js';
import { createUser, verifyUserPassword, getUserById, generateToken, hashPassword, comparePassword } from '../utils/auth.js';
import { query } from '../../db/connection.js';
import crypto from 'crypto';
import { emailService } from '../services/emailService.js';

const router = Router();

// Register new user
router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, businessName } = req.body;

    // Check if user already exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // Check if business name already exists
    const existingBusiness = await query('SELECT id FROM businesses WHERE name = $1', [businessName]);
    if (existingBusiness.rows.length > 0) {
      return res.status(409).json({ error: 'A business with this name already exists' });
    }

    // Create user
    const user = await createUser(email, password, firstName, lastName, businessName);

    // Create business for the user
    const businessResult = await query(
      `INSERT INTO businesses (name, owner_id) 
       VALUES ($1, $2) 
       RETURNING id`,
      [businessName, user.id]
    );

    const businessId = (businessResult.rows[0] as { id: number }).id;

    // Generate JWT token
    const token = generateToken({ ...user, business_id: businessId });

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
router.post('/login', validateBody(loginSchema), async (req, res, next) => {
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

// Forgot password (initiate reset)
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

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

      const appUrl = process.env.APP_URL || 'http://localhost:3000';
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
router.post('/reset-password', validateBody(resetPasswordSchema), async (req, res, next) => {
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
    await query(
      `INSERT INTO security_events (business_id, event_type, description)
       VALUES ($1, 'password_reset', 'User reset password')`,
      [null]
    ).catch(() => {}); // non-fatal

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
    await query(
      `INSERT INTO security_events (business_id, event_type, description, ip_address, user_agent)
       VALUES ($1, 'logout', 'User logged out', $2, $3)`,
      [req.user!.business_id, req.ip, req.get('User-Agent')]
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
