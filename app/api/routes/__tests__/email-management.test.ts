/**
 * Email Management Routes Integration Tests
 * Tests critical email management endpoints (connect email, disconnect email)
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import emailManagementRoutes from '../email-management.js';
import { type AuthRequest } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/errorHandler.js';
import { query } from '../../../db/connection.js';
import { emailService } from '../../services/emailService.js';
// Mock dependencies
jest.mock('../../../db/connection.js', () => ({
  query: jest.fn(),
  getClient: jest.fn()
}));

jest.mock('../../services/emailService.js', () => ({
  emailService: {
    sendPermissionRequest: jest.fn()
  }
}));

jest.mock('../../services/logger.js', () => ({
  emailLogger: {
    info: jest.fn(),
    error: jest.fn()
  },
}));

jest.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: AuthRequest, resp: any, next: any) => {
    req.user = { id: 1, email: 'test@example.com', business_id: 1 };
    next();
  },
  requireBusiness: (req: AuthRequest, resp: any, next: any) => {
    next();
  }
}));

describe('POST /api/emails (connect email)', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use((req: any, res, next) => {
      Object.defineProperty(req, "ip", {
        value: "127.0.0.1",
        writable: true
      });
      req.get = jest.fn((header: string) => {
        if (header === 'User-Agent') return 'test-user-agent';
        return undefined;
      });
      next();
    });
    app.use('/api/emails', emailManagementRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should successfully connect an email', async () => {
    const mockEmail = {
      id: 1,
      email_address: 'monitor@example.com',
      last_checked: null,
      created_at: new Date(),
      updated_at: new Date()
    };
    const mockBusiness = {
      business_name: 'Test Business',
      owner_email: 'owner@example.com'
    };

    (query as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check existing email
      .mockResolvedValueOnce({ rows: [mockEmail], rowCount: 1 }) // Insert email
      .mockResolvedValueOnce({ rows: [mockBusiness], rowCount: 1 }) // Get business info
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Log security event

    (emailService.sendPermissionRequest as jest.Mock).mockResolvedValue(undefined as never);

    const response = await request(app)
      .post('/api/emails')
      .set('Content-Type', 'application/json')
      .send({
        emailAddress: 'monitor@example.com'
      });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Email added successfully and permission request sent');
    expect(response.body.email.emailAddress).toBe('monitor@example.com');
  });

  it('should return 409 when email already exists', async () => {
    (query as any).mockResolvedValueOnce({
      rows: [{ id: 1 }],
      rowCount: 1
    });

    const response = await request(app)
      .post('/api/emails')
      .send({
        emailAddress: 'existing@example.com'
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Email address is already being monitored');
  });

  it('should return 400 when validation fails', async () => {
    const response = await request(app)
      .post('/api/emails')
      .send({
        emailAddress: 'invalid-email'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });
});

describe('DELETE /api/emails/:id (disconnect email)', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use((req: any, res, next) => {
      Object.defineProperty(req, "ip", {
        value: "127.0.0.1",
        writable: true
      });
      req.get = jest.fn((header: string) => {
        if (header === 'User-Agent') return 'test-user-agent';
        return undefined;
      });
      next();
    });
    app.use('/api/emails', emailManagementRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should successfully disconnect an email', async () => {
    const mockEmail = {
      id: 1,
      email_address: 'monitor@example.com'
    };

    (query as any)
      .mockResolvedValueOnce({ rows: [mockEmail], rowCount: 1 }) // Get email info
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Check OAuth tokens
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Delete email
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Log security event

    const response = await request(app)
      .delete('/api/emails/1');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Email removed from monitoring successfully');
    expect(response.body.emailAddress).toBe('monitor@example.com');
  });

  it('should disconnect OAuth tokens when deleting email', async () => {
    const mockEmail = {
      id: 1,
      email_address: 'monitor@example.com'
    };

    (query as any)
      .mockResolvedValueOnce({ rows: [mockEmail], rowCount: 1 }) // Get email info
      .mockResolvedValueOnce({ rows: [{ provider: 'gmail' }], rowCount: 1 }) // Check OAuth tokens
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Delete OAuth tokens
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Delete email
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Log security event

    const response = await request(app)
      .delete('/api/emails/1');

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM oauth_tokens WHERE business_id = $1 AND email_address = $2',
      [1, 'monitor@example.com']
    );
  });

  it('should return 404 when email does not exist', async () => {
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await request(app)
      .delete('/api/emails/999');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Email not found');
  });
});

