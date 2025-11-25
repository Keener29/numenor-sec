/**
 * Auth Routes Integration Tests
 * Tests critical auth endpoints (signup, login)
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import authRoutes from '../auth.js';
import { errorHandler } from '../../middleware/errorHandler.js';

import { query } from '../../../db/connection.js';
import { createUser, verifyUserPassword, generateToken, getUserById, hashPassword } from '../../utils/auth.js';
import { emailService } from '../../services/emailService.js';

// Mock dependencies
jest.mock('../../../db/connection.js', () => ({
  query: jest.fn()
}));

jest.mock('../../utils/auth.js', () => {
  const actual = jest.requireActual('../../utils/auth.js') as Record<string, any>;

  return {
    ...actual,  // TS now allows spreading
    createUser: jest.fn(),
    verifyUserPassword: jest.fn(),
    getUserById: jest.fn(),
    generateToken: jest.fn(),
    getUserByEmail: jest.fn()
  };
});



jest.mock('../../services/emailService.js', () => ({
  emailService: {
    sendPasswordReset: jest.fn()
  }
}));

jest.mock('../../middleware/rateLimit.js', () => ({
  authLimiter: (req: any, res: any, next: any) => next()
}));

describe('POST /api/auth/register', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'development';
  });

  it('should successfully register a new user', async () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User'
    };
    const mockBusiness = { id: 1, business_name: 'Test Business' };
    const mockToken = 'mock-jwt-token';

    (query as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing user
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing business
      .mockResolvedValueOnce({ rows: [mockBusiness], rowCount: 1 }); // Create business

    (createUser as any).mockResolvedValue(mockUser);
    (generateToken as any).mockReturnValue(mockToken);

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        businessName: 'Test Business'
      });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('User registered successfully');
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.token).toBe(mockToken);
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('should return 409 when user already exists', async () => {
    (query as any).mockResolvedValueOnce({
      rows: [{ id: 1 }],
      rowCount: 1
    });

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        businessName: 'Test Business'
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('User with this email already exists');
  });

  it('should return 400 when validation fails', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'invalid-email',
        password: '123',
        firstName: '',
        lastName: '',
        businessName: ''
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });
});

describe('POST /api/auth/login', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'development';
  });

  it('should successfully login with valid credentials', async () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      business_name: 'Test Business',
      business_id: 1
    };
    const mockToken = 'mock-jwt-token';

    (verifyUserPassword as any).mockResolvedValue(mockUser);
    (generateToken as any).mockReturnValue(mockToken);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Login successful');
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.token).toBe(mockToken);
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('should return 401 when credentials are invalid', async () => {
    (verifyUserPassword as any).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrongpassword'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid email or password');
  });

  it('should return 400 when validation fails', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'invalid-email',
        password: ''
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });
});

describe('POST /api/auth/forgot-password', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
    process.env.APP_URL = 'http://localhost:3000';
    process.env.NODE_ENV = 'development';
  });
  it('should successfully send a password reset email', async () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      business_name: 'Test Business',
      business_id: 1
    };
    (query as any).mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 });
    (getUserById as any).mockResolvedValue(mockUser);
    (emailService as any).sendPasswordReset.mockResolvedValue(true);

    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'test@example.com' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('If that account exists, a reset link has been sent.');
  });
  it('should return 400 when validation fails', async () => {
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'invalid-email' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });
  it('should return 200 when user does not exist', async () => {
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'test@example.com' });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('If that account exists, a reset link has been sent.');
  });
});

describe('POST /api/auth/reset-password', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });
  
  it('should successfully reset password', async () => {
    const mockToken = 'mock-jwt-token';
    const mockPasswordHash = {
      password_hash: await hashPassword('mock-password-hash')
    }
    const mockTokenRow = {
      user_id: 1,
      expires_at: new Date(Date.now() + 1000),
      used_at: null
    };
    (query as any).mockResolvedValueOnce({ rows: [mockTokenRow], rowCount: 1 }); // Lookup token
    (query as any).mockResolvedValueOnce({ rows: [mockPasswordHash], rowCount: 1 }); // Check password hash
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Update password
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Mark token as used
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Log event
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: mockToken, newPassword: 'password123' });
    
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Password has been reset successfully');
  });

  it('should return 400 when min length is not met', async () => {
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'invalid-token', newPassword: 'short' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });
  it('should return 400 when token is invalid', async () => {
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: '', newPassword: 'password123' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });
  it('should return 400 when token is already used', async () => {
    const mockToken = 'mock-jwt-token';
    const mockTokenRow = {
      user_id: 1,
      expires_at: new Date(Date.now() + 1000),
      used_at: new Date()
    };
    (query as any).mockResolvedValueOnce({ rows: [mockTokenRow], rowCount: 1 });
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: mockToken, newPassword: 'password123' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('This reset link has already been used');
  });
  it('should return 400 when token is expired', async () => {
    const mockToken = 'mock-jwt-token';
    (query as any).mockResolvedValueOnce({ rows: [{ expires_at: new Date(Date.now() - 1000) }], rowCount: 1 });
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: mockToken, newPassword: 'password123' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Reset link has expired');
  });
  it('should return 400 when new password is the same as the current password', async () => {
    const mockToken = 'mock-jwt-token';
    const passwordHash = await hashPassword('password123')
    const mockPasswordHash: { password_hash: string } = {
      password_hash: passwordHash
    }
    const mockTokenRow = {
      user_id: 1,
      expires_at: new Date(Date.now() + 1000),
      used_at: null
    };
    (query as any).mockResolvedValueOnce({ rows: [mockTokenRow], rowCount: 1 });
    (query as any).mockResolvedValueOnce({ rows: [mockPasswordHash], rowCount: 1 });
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: mockToken, newPassword: 'password123' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('New password must be different from your previous password');
  });
  it('should return 404 when user does not exist', async () => {
    const mockToken = 'mock-jwt-token';
    const mockTokenRow = {
      user_id: 1,
      expires_at: new Date(Date.now() + 1000),
      used_at: null
    };
    (query as any).mockResolvedValueOnce({ rows: [mockTokenRow], rowCount: 1 });
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: mockToken, newPassword: 'password123' });
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('User not found');
  });
});