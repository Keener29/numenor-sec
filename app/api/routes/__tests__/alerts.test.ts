/**
 * Alerts Routes Integration Tests
 * Tests critical alerts endpoints (create alert, list alerts)
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import alertsRoutes from '../alerts.js';
import { type AuthRequest } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/errorHandler.js';

// Mock dependencies
jest.mock('../../../db/connection.js', () => ({
  query: jest.fn()
}));

jest.mock('../../../utils/logger.js', () => ({
  oauthLogger: {
    debug: jest.fn()
  }
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

import { query } from '../../../db/connection.js';

describe('POST /api/alerts (create alert)', () => {
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
    app.use('/api/alerts', alertsRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should successfully create an alert', async () => {
    const mockEmail = { id: 1 };
    const mockAlert = {
      id: 1,
      email_id: 1,
      subject: 'Suspicious Email',
      sender_email: 'phisher@example.com',
      recipient_email: 'user@example.com',
      threat_level: 'high',
      status: 'pending',
      alert_type: 'phishing',
      description: 'Test alert',
      raw_email_data: null,
      created_at: new Date(),
      updated_at: new Date()
    };

    (query as any)
      .mockResolvedValueOnce({ rows: [mockEmail], rowCount: 1 }) // Verify email belongs to business
      .mockResolvedValueOnce({ rows: [mockAlert] }) // Create alert
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Log security event

    const response = await request(app)
      .post('/api/alerts')
      .send({
        emailId: 1,
        subject: 'Suspicious Email',
        senderEmail: 'phisher@example.com',
        recipientEmail: 'user@example.com',
        threatLevel: 'high',
        alertType: 'phishing',
        description: 'Test alert'
      });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Alert created successfully');
    expect(response.body.alert.subject).toBe('Suspicious Email');
    expect(response.body.alert.threatLevel).toBe('high');
  });

  it('should return 404 when email does not belong to business', async () => {
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await request(app)
      .post('/api/alerts')
      .send({
        emailId: 999,
        subject: 'Suspicious Email',
        senderEmail: 'phisher@example.com',
        recipientEmail: 'user@example.com',
        threatLevel: 'high',
        alertType: 'phishing'
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Email not found or does not belong to your business');
  });

  it('should return 400 when validation fails', async () => {
    const response = await request(app)
      .post('/api/alerts')
      .send({
        emailId: 'invalid',
        subject: '',
        senderEmail: 'invalid-email',
        recipientEmail: 'invalid-email',
        threatLevel: 'invalid-level',
        alertType: ''
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
  });
});

describe('GET /api/alerts (list alerts)', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/alerts', alertsRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should successfully list alerts', async () => {
    const mockAlerts = [
      {
        id: 1,
        email_id: 1,
        email_address: 'user@example.com',
        subject: 'Suspicious Email',
        sender_email: 'phisher@example.com',
        recipient_email: 'user@example.com',
        threat_level: 'high',
        status: 'pending',
        alert_type: 'phishing',
        description: 'Test alert',
        raw_email_data: null,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    (query as any)
      .mockResolvedValueOnce({ rows: mockAlerts, rowCount: 1 }) // Get alerts
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 }); // Get count

    const response = await request(app)
      .get('/api/alerts?page=1&limit=10');

    expect(response.status).toBe(200);
    expect(response.body.alerts).toHaveLength(1);
    expect(response.body.alerts[0].subject).toBe('Suspicious Email');
    expect(response.body.pagination).toBeDefined();
    expect(response.body.pagination.page).toBe(1);
    expect(response.body.pagination.limit).toBe(10);
  });

  it('should filter alerts by status', async () => {
    (query as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

    const response = await request(app)
      .get('/api/alerts?page=1&limit=10&status=pending');

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND pa.status = $2'),
      expect.arrayContaining([1, 'pending'])
    );
  });

  it('should return 400 when validation fails', async () => {
    const response = await request(app)
      .get('/api/alerts?page=invalid&limit=invalid');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Query validation failed');
  });
});

