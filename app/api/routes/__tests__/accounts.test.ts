/**
 * Auth Routes Integration Tests
 * Tests critical auth endpoints (signup, login)
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import accountsRoutes from '../accounts.js';
import { errorHandler } from '../../middleware/errorHandler.js';

import { query } from '../../../db/connection.js';
import type { AuthRequest } from '../../middleware/auth.js';


// Mock dependencies
jest.mock('../../../db/connection.js', () => ({
    query: jest.fn()
  }));
  
jest.mock('../../middleware/auth.js', () => ({
    authenticateToken: (req: AuthRequest, resp: any, next: any) => {
        req.user = { id: 1, email: 'test@example.com', business_id: 1 };
        next();
    }
}));

describe('DELETE /api/accounts/:accountId', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/accounts', accountsRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should successfully delete an account', async () => {
    const mockAccountId = 1;
    const mockUser = {
      id: mockAccountId,
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      business_name: 'Test Business',
      business_id: 1
    };
    const userDetails = {
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      business_name: 'Test Business'
    };

    (query as any)
      .mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 }) // Get user
      .mockResolvedValueOnce({ rows: [userDetails], rowCount: 1 }) // Get user details
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Insert deletion reason
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Delete business
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Delete user

    const response = await request(app)
      .delete(`/api/accounts/${mockAccountId}`)
      .send({
        reason: 'Test reason'
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('deleted');
    expect(response.body.accountId).toBe(mockAccountId);
    expect(response.body.businessDeleted).toBe(true);
  });
  it('should return 400 when validation fails', async () => {
    const response = await request(app)
      .delete(`/api/accounts/invalid`)
      .send({
        reason: 'Test reason'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid account ID');
  });
  it('should return 403 when trying to delete another user\'s account', async () => {
    const response = await request(app)
      .delete(`/api/accounts/2`)
      .send({
        reason: 'Test reason'
      });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('You can only delete your own account');
  });
  it('should return 404 when account does not exist', async () => {
    (query as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // User not found

    const response = await request(app)
      .delete(`/api/accounts/1`)
      .send({
        reason: 'Does not exist'
      });
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Account not found');
  });
});