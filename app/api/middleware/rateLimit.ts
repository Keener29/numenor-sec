import rateLimit from 'express-rate-limit';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for OAuth auth-url endpoints (prevent abuse of URL generation)
export const oauthAuthUrlLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 OAuth URL generation attempts per hour
  message: 'Too many OAuth authorization requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Looser rate limiter for OAuth callback endpoints (callbacks come from OAuth providers)
export const oauthCallbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit each IP to 50 OAuth callbacks per hour (looser since these are from providers)
  message: 'Too many OAuth callback requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Legacy: Keep oauthLimiter for backward compatibility (use oauthAuthUrlLimiter instead)
export const oauthLimiter = oauthAuthUrlLimiter;

