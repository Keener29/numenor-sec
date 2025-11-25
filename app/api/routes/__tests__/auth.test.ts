/**
 * Auth Routes Integration Tests
 * Tests critical auth endpoints (signup, login)
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import authRoutes from '../auth.js';
import { errorHandler } from '../../middleware/errorHandler.js';

// Mock dependencies
jest.mock('../../../db/connection.js', () => ({
  query: jest.fn()
}));

jest.mock('../../utils/auth.js', () => ({
  createUser: jest.fn(),
  verifyUserPassword: jest.fn(),
  getUserById: jest.fn(),
  generateToken: jest.fn(),
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
  getUserByEmail: jest.fn()
}));

jest.mock('../../services/emailService.js', () => ({
  emailService: {
    sendPasswordReset: jest.fn()
  }
}));

jest.mock('../../middleware/rateLimit.js', () => ({
  authLimiter: (req: any, res: any, next: any) => next()
}));

import { query } from '../../../db/connection.js';
import { createUser, verifyUserPassword, generateToken } from '../../utils/auth.js';

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

