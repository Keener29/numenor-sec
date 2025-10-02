import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.js';
import gymRoutes from './routes/gym.js';
import emailRoutes from './routes/emails.js';
import alertRoutes from './routes/alerts.js';

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
    : ['http://localhost:5173', 'http://localhost:3000'], // React Router dev server
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
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
app.use('/api/gym', gymRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/alerts', alertRoutes);

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
      gym: {
        'GET /api/gym': 'Get gym information',
        'PUT /api/gym': 'Update gym information',
        'GET /api/gym/stats': 'Get gym statistics'
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
      }
    }
  });
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Numenor Security API server running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
