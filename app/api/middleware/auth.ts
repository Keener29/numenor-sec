import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    gym_id?: number;
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
    next(); // jump to require gym middleware
  });
};

// checks if the user belongs to a gym
export const requireGym = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.gym_id) {
    return res.status(403).json({ error: 'Gym access required' });
  }
  next(); // jump to the route handler
};
