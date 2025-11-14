import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware to enforce HTTPS in production
 * Redirects HTTP requests to HTTPS
 */
export const enforceHttps = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === 'production') {
    // Check if request is already HTTPS (via proxy header)
    const forwardedProto = req.header('x-forwarded-proto');
    if (forwardedProto && forwardedProto !== 'https') {
      const host = req.header('host');
      const url = req.url;
      return res.redirect(301, `https://${host}${url}`);
    }
  }
  next();
};

