import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { logger } from './services/logger.js';

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

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.API_PORT || 3001;

// Security middleware (XSS Protection, HTTP Strict Transport Security, etc)
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://numenorsecurity.com']
    : ['http://localhost:3000'], // React Router dev server
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware
app.use(cookieParser());

// Request logging middleware
app.use((req, res, next) => {
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/phishing', phishingRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/status', statusRoutes);

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
        'POST /api/auth/change-password': 'Change user password',
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
              'GET /api/oauth/gmail/status/:emailAddress': 'Get Gmail OAuth connection status',
              'POST /api/oauth/gmail/test': 'Test Gmail OAuth connection'
            }
    }
  });
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, async () => {
  logger.info('Numenor Security API server started', {
    operation: 'server-startup',
    metadata: {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      apiDocs: `http://localhost:${PORT}/api`,
      healthCheck: `http://localhost:${PORT}/health`
    }
  });
  
  // Initialize background services
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
