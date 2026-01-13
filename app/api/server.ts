import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.js';
import businessRoutes from './routes/business.js';
import emailRoutes from './routes/emails.js';
import alertRoutes from './routes/alerts.js';
import phishingRoutes from './routes/phishing.js';
import oauthRoutes from './routes/oauth/index.js';
import statusRoutes from './routes/status.js';
import accountsRoutes from './routes/accounts.js';
import gmailNotifyRoutes from './routes/gmail-notify.js';
import microsoftNotifyRoutes from './routes/microsoft-notify.js';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { enforceHttps } from './middleware/httpsEnforcement.js';

const app = express();
const PORT = Number.parseInt(process.env.API_PORT || '3001');

app.set('trust proxy', 1);

// HTTPS enforcement middleware (must be before other middleware)
app.use(enforceHttps);

// Security middleware (XSS Protection, HTTP Strict Transport Security, etc)
app.use(helmet({
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  } : false
}));

// CORS configuration
// Allow CORS_ORIGINS env var for flexible configuration (supports multiple origins)
// Format: comma-separated list, e.g., "https://numenorsecurity.com,https://www.numenorsecurity.com"
const getAllowedOrigins = (): string[] => {
  if (process.env.CORS_ORIGINS) {
    return process.env.CORS_ORIGINS.split(',').map(origin => origin.trim());
  }
  return process.env.NODE_ENV === 'production' 
    ? ['https://numenorsecurity.com', 'https://www.numenorsecurity.com']
    : ['http://localhost:3000']; // React Router dev server
};

app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true
}));

// Cookie parsing middleware
app.use(cookieParser());

// Apply general rate limiting to all API routes
app.use('/api', apiLimiter);

// Request logging middleware
app.use((req, res, next) => {
  next();
});

// Health check endpoint (excluded from rate limiting)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Pub/Sub webhook route and MS graph webhook route - must be registered BEFORE express.json() to handle raw body
// Pub/Sub sends Base64-encoded payloads that must be decoded before JSON parsing
app.use('/api/gmail-notify', express.raw({ type: 'application/json', limit: '10mb' }), gmailNotifyRoutes);
app.use('/api/microsoft-notify', express.json(), microsoftNotifyRoutes);

// Body parsing middleware (for all other routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/phishing', phishingRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/accounts', accountsRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'Numenor Security API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Register new user',
        'POST /api/auth/login': 'Login user',
        'GET /api/auth/me': 'Get current user profile',
        'POST /api/auth/change-password': 'User changes their password',
        'POST /api/auth/forgot-password': 'User requests a password reset',
        'POST /api/auth/reset-password': 'User resets their password using a token',
        'POST /api/auth/logout': 'Logout user'
      },
      business: {
        'GET /api/business': 'Get business information',
        'PUT /api/business': 'Update business information',
        'GET /api/business/stats': 'Get business statistics'
      },
      emails: {
        'GET /api/emails': 'Get monitored emails',
        'POST /api/emails': 'Add email for monitoring',
        'PUT /api/emails/:id': 'Update email connection status',
        'DELETE /api/emails/:id': 'Remove email from monitoring',
        'GET /api/emails/stats': 'Get email monitoring statistics'
      },
      alerts: {
        'GET /api/alerts': 'Get phishing alerts',
        'GET /api/alerts/:id': 'Get specific alert',
        'PUT /api/alerts/:id': 'Update alert status',
        'POST /api/alerts': 'Create new alert',
        'GET /api/alerts/stats': 'Get alert statistics'
      },
      phishing: {
        'POST /api/phishing/scan': 'Manually trigger email scan',
        'GET /api/phishing/statistics': 'Get phishing threat statistics',
        'GET /api/phishing/patterns': 'Get detected phishing patterns',
        'GET /api/phishing/monitoring/status': 'Get monitoring service status',
        'POST /api/phishing/monitoring/start': 'Start email monitoring',
        'POST /api/phishing/monitoring/stop': 'Stop email monitoring',
        'GET /api/phishing/recommendations': 'Get security recommendations'
      },
      oauth: {
        'GET /api/oauth/providers': 'Get list of available OAuth providers',
        'GET /api/oauth/gmail/auth-url': 'Generate Gmail OAuth authorization URL',
        'GET /api/oauth/gmail/callback': 'Handle Gmail OAuth callback',
        'POST /api/oauth/gmail/disconnect': 'Disconnect Gmail OAuth',
        'POST /api/oauth/gmail/test': 'Test Gmail OAuth connection',
        'GET /api/oauth/microsoft/auth-url': 'Generate Outlook OAuth authorization URL',
        'GET /api/oauth/microsoft/callback': 'Handle Outlook OAuth callback',
        'POST /api/oauth/microsoft/disconnect': 'Disconnect Outlook OAuth',
        'POST /api/oauth/microsoft/test': 'Test Outlook OAuth connection'
      },
      gmailNotify: {
        'POST /api/gmail-notify': 'Handle Gmail push notifications'
      }
    }
  });
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const host = process.env.API_HOST || 'localhost';

  logger.info('Numenor Security API server started', {
    operation: 'server-startup',
    metadata: {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      apiDocs: `${protocol}://${host}:${PORT}/api`,
      healthCheck: `${protocol}://${host}:${PORT}/health`
    }
  });
  
  try {
    const { initializeServices } = await import('./startup.js');
    await initializeServices();
  } catch (error) {
    logger.error('Failed to initialize services', {
      operation: 'server-startup'
    }, error as Error);
  }
});


export default app;
