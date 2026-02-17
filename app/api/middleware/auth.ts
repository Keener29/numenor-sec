import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    business_id?: number; // Note: Still using business_id for database compatibility
  };
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  // Check for token in Authorization header first (for client-side API calls)
  const authHeader = req.headers["authorization"];
  let token = authHeader?.split(" ")[1]; // Bearer TOKEN

  // If no token in header, check cookies (for server-side requests)
  if (!token) {
    token = req.cookies?.authToken;
  }

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  const jwtSecret = process.env.JWT_SECRET; // password that only your server knows (sign and verify JWT tokens)
  if (!jwtSecret) {
    return res.status(500).json({ error: "JWT secret not configured" });
  }

  jwt.verify(token, jwtSecret, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    console.log(
      `[Auth] Verified User: ${user.email} (ID: ${user.id}) | Biz ID: ${user.business_id}`,
    );
    req.user = user;
    next(); // jump to require business middleware
  });
};

// checks if the user belongs to a business
export const requireBusiness = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user?.business_id) {
    return res.status(403).json({ error: "Business access required" });
  }
  next(); // jump to the route handler
};
