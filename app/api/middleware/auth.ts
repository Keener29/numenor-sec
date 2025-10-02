import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    business_id?: number; // Note: Still using business_id for database compatibility
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const jwtSecret = process.env.JWT_SECRET; // password that only your server knows (sign and verify JWT tokens)
  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT secret not configured' });
  }

  jwt.verify(token, jwtSecret, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next(); // jump to require business middleware
  });
};

// checks if the user belongs to a business
export const requireBusiness = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.business_id) {
    return res.status(403).json({ error: 'Business access required' });
  }
  next(); // jump to the route handler
};
