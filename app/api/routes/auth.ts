import { Router } from 'express';
import { validateBody } from '../middleware/validation.js';
import { authenticateToken, type AuthRequest } from '../middleware/auth.js';
import { registerSchema, loginSchema, changePasswordSchema } from '../schemas/user.js';
import { createUser, verifyUserPassword, getUserById, generateToken, hashPassword, comparePassword } from '../utils/auth.js';
import { query } from '../../db/connection.js';

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
    const { email, password } = req.body;

    const user = await verifyUserPassword(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);

    // Set HTTP-only cookie for server-side authentication
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
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
