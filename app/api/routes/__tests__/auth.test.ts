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
import { createUser, verifyUserPassword, generateToken, getUserById, hashPassword, verifyGoogleToken, verifyMicrosoftToken, getUserByEmail } from '../../utils/auth.js';
import { emailService } from '../../services/emailService.js';
import { type AuthRequest } from '../../middleware/auth.js';
// Mock dependencies
jest.mock('../../../db/connection.js', () => ({
  query: jest.fn()
}));

jest.mock('../../utils/auth.js', () => {
    return {
        createUser: jest.fn(),
        verifyUserPassword: jest.fn(),
        getUserById: jest.fn(),
        generateToken: jest.fn(),
        getUserByEmail: jest.fn(),
        verifyGoogleToken: jest.fn(),
        verifyMicrosoftToken: jest.fn(),
        hashPassword: async (password: string) => password,
        comparePassword: async (password: string, hash: string) => password === hash
    }
});

jest.mock('../../services/emailService.js', () => ({
  emailService: {
    sendPasswordReset: jest.fn()
  }
}));

jest.mock('../../middleware/rateLimit.js', () => ({
  authLimiter: (req: any, res: any, next: any) => next(),
}));
jest.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: AuthRequest, resp: any, next: any) => {
      req.user = { id: 1, email: 'test@example.com', business_id: 1 };
      next();
  }
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
  it('should return 409 when business name already exists', async () => {
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    (query as any).mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }); // Check existing business
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        businessName: 'Test Business'
      });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('A business with this name already exists');
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
    const mockPasswordHash = await hashPassword('mock-password-hash');
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
describe('POST /api/auth/google', () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.NODE_ENV = 'development';
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });
  it('should successfully login with valid credentials', async () => {
    const mockGmailPayload = {
      email: 'test@example.com',
      given_name: 'Test',
      family_name: 'User',
    };
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      business_name: 'Test Business',
      business_id: 1
    };
    (verifyGoogleToken as any).mockResolvedValueOnce(mockGmailPayload);
    (getUserByEmail as any).mockResolvedValueOnce(mockUser);
    (generateToken as any).mockResolvedValueOnce("mock-jwt-token");

    const response = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'mock-credential' });  

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Google login successful');
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.businessId).toBe(1);
  });
  it('should successfully sign up with valid credentials', async () => {
    const mockGmailPayload = {
      email: 'test@example.com',
      given_name: 'Test',
      family_name: 'User',
    };
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      business_name: 'Test Business',
      business_id: 1
    };
    const mockBusiness = { id: 1, business_name: 'Test Business' };
    (verifyGoogleToken as any).mockResolvedValueOnce(mockGmailPayload);
    (getUserByEmail as any).mockResolvedValueOnce(null);
    (createUser as any).mockResolvedValueOnce(mockUser);
    (query as any).mockResolvedValueOnce({ rows: [mockBusiness], rowCount: 1 });
    (generateToken as any).mockResolvedValueOnce("mock-jwt-token");

    const response = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'mock-credential' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Google login successful');
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.businessId).toBe(1);
  });
  it('should successfully sign up user when no business is found but business exists', async () => {
    const mockGmailPayload = {
      email: 'test@example.com',
      given_name: 'Test',
      family_name: 'User',
    };
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      business_name: null,
      business_id: undefined
    };
    const mockBusiness = { id: 1, business_name: 'Test Business' };
    (verifyGoogleToken as any).mockResolvedValueOnce(mockGmailPayload);
    (getUserByEmail as any).mockResolvedValueOnce(mockUser);
    (query as any).mockResolvedValueOnce({ rows: [mockBusiness], rowCount: 1 }); // get business id
    (generateToken as any).mockResolvedValueOnce("mock-jwt-token");
    
    const response = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'mock-credential' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Google login successful');
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.businessId).toBe(1);
  });
  it('should successfully sign up user when no business exists', async () => {
    const mockGmailPayload = {
      email: 'test@example.com',
      given_name: 'Test',
      family_name: 'User',
    };
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      business_name: null,
      business_id: undefined
    };
    const mockBusiness = { id: 1, business_name: 'Test Business' };
    (verifyGoogleToken as any).mockResolvedValueOnce(mockGmailPayload);
    (getUserByEmail as any).mockResolvedValueOnce(mockUser);
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 }); // check if business exists
    (query as any).mockResolvedValueOnce({ rows: [mockBusiness], rowCount: 1 }); // create business
    (generateToken as any).mockResolvedValueOnce("mock-jwt-token");
    
    const response = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'mock-credential' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Google login successful');
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.businessId).toBe(1);
  });
  it('should return 401 when credentials are invalid', async () => {
    const response = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'invalid-credential' });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid Google credential');
  });
  it('should return 400 when validation fails', async () => {
    const response = await request(app)
      .post('/api/auth/google')
      .send({ credential: '' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });
  it('should return 500 when Google client is not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const response = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'mock-credential' });
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Google client not configured');
  });
});

describe('POST /api/auth/microsoft', () => {
  let app: express.Application;

  beforeEach(() => {
    process.env.AZURE_CLIENT_ID = 'test-azure-client-id';
    process.env.NODE_ENV = 'development';
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should successfully login with valid credentials', async () => {
    const mockMicrosoftPayload = {
      email: 'test@example.com',
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
    };
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      business_name: 'Test Business',
      business_id: 1
    };
    (verifyMicrosoftToken as any).mockResolvedValueOnce(mockMicrosoftPayload);
    (getUserByEmail as any).mockResolvedValueOnce(mockUser);
    (generateToken as any).mockReturnValueOnce("mock-jwt-token");

    const response = await request(app)
      .post('/api/auth/microsoft')
      .send({ idToken: 'mock-id-token' });  

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Microsoft login successful');
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.businessId).toBe(1);
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('should successfully sign up with valid credentials', async () => {
    const mockMicrosoftPayload = {
      email: 'test@example.com',
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
    };
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
    };
    const mockBusiness = { id: 1, business_name: null };
    (verifyMicrosoftToken as any).mockResolvedValueOnce(mockMicrosoftPayload);
    (getUserByEmail as any).mockResolvedValueOnce(null);
    (createUser as any).mockResolvedValueOnce(mockUser);
    (query as any).mockResolvedValueOnce({ rows: [mockBusiness], rowCount: 1 });
    (generateToken as any).mockReturnValueOnce("mock-jwt-token");

    const response = await request(app)
      .post('/api/auth/microsoft')
      .send({ idToken: 'mock-id-token' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Microsoft login successful');
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.businessId).toBe(1);
  });

  it('should successfully login when user exists but no business_id', async () => {
    const mockMicrosoftPayload = {
      email: 'test@example.com',
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
    };
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      business_name: null,
      business_id: undefined
    };
    const mockBusiness = { id: 1, business_name: 'Test Business' };
    (verifyMicrosoftToken as any).mockResolvedValueOnce(mockMicrosoftPayload);
    (getUserByEmail as any).mockResolvedValueOnce(mockUser);
    (query as any).mockResolvedValueOnce({ rows: [mockBusiness], rowCount: 1 });
    (generateToken as any).mockReturnValueOnce("mock-jwt-token");
    
    const response = await request(app)
      .post('/api/auth/microsoft')
      .send({ idToken: 'mock-id-token' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Microsoft login successful');
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.businessId).toBe(1);
  });

  it('should return 401 when credentials are invalid', async () => {
    (verifyMicrosoftToken as any).mockResolvedValueOnce(null);
    const response = await request(app)
      .post('/api/auth/microsoft')
      .send({ idToken: 'invalid-id-token' });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid Microsoft credential');
  });

  it('should return 400 when validation fails', async () => {
    const response = await request(app)
      .post('/api/auth/microsoft')
      .send({ idToken: '' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });

  it('should return 500 when Azure client is not configured', async () => {
    delete process.env.AZURE_CLIENT_ID;
    const response = await request(app)
      .post('/api/auth/microsoft')
      .send({ idToken: 'mock-id-token' });
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Microsoft client not configured');
  });
});

describe('GET /api/auth/me', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });
  it('should successfully get current user profile', async () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      business_name: 'Test Business',
      business_id: 1
    };
    (getUserById as any).mockResolvedValueOnce(mockUser);
    const response = await request(app)
      .get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.firstName).toBe('Test');
    expect(response.body.user.lastName).toBe('User');
    expect(response.body.user.businessName).toBe('Test Business');
    expect(response.body.user.businessId).toBe(1);
  });
  it('should return 404 when user does not exist', async () => {
    (getUserById as any).mockResolvedValueOnce(null);
    const response = await request(app)
      .get('/api/auth/me');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('User not found');
  });
});

describe('POST /api/auth/logout', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });
  it('should successfully logout', async () => {
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const response = await request(app)
      .post('/api/auth/logout');
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Logout successful');
  });
});