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

jest.mock('../../utils/securityEventLogger.js', () => ({
  securityEventLogger: {
    logSecurityEvent: jest.fn().mockResolvedValue(undefined as never)
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

    // Reset mocks to ensure clean state
    (query as any).mockReset();
    (query as any)
      .mockResolvedValueOnce({ rows: mockAlerts }) // Get alerts (first call)
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // Get count (second call)

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
      .mockResolvedValueOnce({ rows: [] }) // Get alerts
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Get count

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

  it('should filter alerts by threatLevel', async () => {
    (query as any)
      .mockResolvedValueOnce({ rows: [] }) // Get alerts
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Get count

    const response = await request(app)
      .get('/api/alerts?page=1&limit=10&threatLevel=high');

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND pa.threat_level = $2'),
      expect.arrayContaining([1, 'high'])
    );
  });

  it('should filter alerts by emailId', async () => {
    (query as any)
      .mockResolvedValueOnce({ rows: [] }) // Get alerts
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Get count

    const response = await request(app)
      .get('/api/alerts?page=1&limit=10&emailId=5');

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND pa.email_id = $2'),
      expect.arrayContaining([1, 5])
    );
  });

  it('should filter alerts by startDate', async () => {
    const startDate = '2024-01-01T00:00:00Z';
    (query as any)
      .mockResolvedValueOnce({ rows: [] }) // Get alerts
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Get count

    const response = await request(app)
      .get(`/api/alerts?page=1&limit=10&startDate=${encodeURIComponent(startDate)}`);

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND pa.created_at >= $2'),
      expect.arrayContaining([1, startDate])
    );
  });

  it('should filter alerts by endDate', async () => {
    const endDate = '2024-12-31T23:59:59Z';
    (query as any)
      .mockResolvedValueOnce({ rows: [] }) // Get alerts
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Get count

    const response = await request(app)
      .get(`/api/alerts?page=1&limit=10&endDate=${encodeURIComponent(endDate)}`);

    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND pa.created_at <= $2'),
      expect.arrayContaining([1, endDate])
    );
  });

  it('should combine multiple filters', async () => {
    const startDate = '2024-01-01T00:00:00Z';
    const endDate = '2024-12-31T23:59:59Z';
    (query as any).mockReset();
    (query as any)
      .mockResolvedValueOnce({ rows: [] }) // Get alerts (includes limit and offset)
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }); // Get count (no limit/offset)

    const response = await request(app)
      .get(`/api/alerts?page=1&limit=10&status=pending&threatLevel=high&emailId=5&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);

    expect(response.status).toBe(200);
    // First call is for alerts with LIMIT/OFFSET - includes limit and offset params
    const alertsQueryCall = (query as any).mock.calls[0];
    expect(alertsQueryCall[0]).toContain('AND pa.status = $2');
    expect(alertsQueryCall[0]).toContain('AND pa.threat_level = $3');
    expect(alertsQueryCall[0]).toContain('AND pa.email_id = $4');
    expect(alertsQueryCall[0]).toContain('AND pa.created_at >= $5');
    expect(alertsQueryCall[0]).toContain('AND pa.created_at <= $6');
    expect(alertsQueryCall[1]).toEqual([1, 'pending', 'high', 5, startDate, endDate, 10, 0]);
    
    // Second call is for count - no limit/offset
    const countQueryCall = (query as any).mock.calls[1];
    expect(countQueryCall[1]).toEqual([1, 'pending', 'high', 5, startDate, endDate]);
  });
});

describe('GET /api/alerts/stats', () => {
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

  it('should return alert statistics', async () => {
    (query as any)
      .mockResolvedValueOnce({ rows: [{ count: '10' }] }) // Total alerts
      .mockResolvedValueOnce({ rows: [{ status: 'pending', count: '5' }, { status: 'reviewed', count: '3' }] }) // Status counts
      .mockResolvedValueOnce({ rows: [{ threat_level: 'high', count: '7' }, { threat_level: 'medium', count: '3' }] }) // Threat level counts
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // Recent alerts
      .mockResolvedValueOnce({ rows: [{ date: '2024-01-01', count: '1' }, { date: '2024-01-02', count: '1' }] }); // Daily alerts

    const response = await request(app)
      .get('/api/alerts/stats');

    expect(response.status).toBe(200);
    expect(response.body.stats).toBeDefined();
    expect(response.body.stats.totalAlerts).toBe(10);
    expect(response.body.stats.recentAlerts).toBe(2);
    expect(response.body.stats.statusCounts).toEqual({ pending: 5, reviewed: 3 });
    expect(response.body.stats.threatLevelCounts).toEqual({ high: 7, medium: 3 });
    expect(response.body.stats.dailyAlerts).toHaveLength(2);
  });
});

describe('GET /api/alerts/:id', () => {
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

  it('should return a specific alert', async () => {
    const mockAlert = {
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
    };

    (query as any).mockResolvedValueOnce({ rows: [mockAlert], rowCount: 1 });

    const response = await request(app)
      .get('/api/alerts/1');

    expect(response.status).toBe(200);
    expect(response.body.alert).toBeDefined();
    expect(response.body.alert.id).toBe(1);
    expect(response.body.alert.subject).toBe('Suspicious Email');
  });

  it('should return 404 when alert not found', async () => {
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const response = await request(app)
      .get('/api/alerts/999');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Alert not found');
  });

  it('should return 400 when alert ID is invalid', async () => {
    const response = await request(app)
      .get('/api/alerts/invalid');

    expect(response.status).toBe(400);
  });
});

describe('PUT /api/alerts/:id', () => {
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
        if (header === 'X-Forwarded-For') return '192.168.1.1';
        return undefined;
      });
      next();
    });
    app.use('/api/alerts', alertsRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should update alert status', async () => {
    const mockAlert = {
      id: 1,
      email_id: 1,
      subject: 'Suspicious Email',
      sender_email: 'phisher@example.com',
      recipient_email: 'user@example.com',
      threat_level: 'high',
      status: 'reviewed',
      alert_type: 'phishing',
      description: 'Test alert',
      raw_email_data: null,
      created_at: new Date(),
      updated_at: new Date()
    };

    (query as any)
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }], rowCount: 1 }) // Verify alert belongs to business
      .mockResolvedValueOnce({ rows: [mockAlert], rowCount: 1 }); // Update alert

    const response = await request(app)
      .put('/api/alerts/1')
      .send({ status: 'reviewed' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Alert updated successfully');
    expect(response.body.alert.status).toBe('reviewed');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('status = $1'),
      expect.arrayContaining(['reviewed'])
    );
  });

  it('should update alert description', async () => {
    const mockAlert = {
      id: 1,
      email_id: 1,
      subject: 'Suspicious Email',
      sender_email: 'phisher@example.com',
      recipient_email: 'user@example.com',
      threat_level: 'high',
      status: 'pending',
      alert_type: 'phishing',
      description: 'Updated description',
      raw_email_data: null,
      created_at: new Date(),
      updated_at: new Date()
    };

    (query as any)
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }], rowCount: 1 }) // Verify alert belongs to business
      .mockResolvedValueOnce({ rows: [mockAlert], rowCount: 1 }); // Update alert

    const response = await request(app)
      .put('/api/alerts/1')
      .send({ description: 'Updated description' });

    expect(response.status).toBe(200);
    expect(response.body.alert.description).toBe('Updated description');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('description = $1'),
      expect.arrayContaining(['Updated description'])
    );
  });

  it('should update both status and description', async () => {
    const mockAlert = {
      id: 1,
      email_id: 1,
      subject: 'Suspicious Email',
      sender_email: 'phisher@example.com',
      recipient_email: 'user@example.com',
      threat_level: 'high',
      status: 'reviewed',
      alert_type: 'phishing',
      description: 'Updated description',
      raw_email_data: null,
      created_at: new Date(),
      updated_at: new Date()
    };

    (query as any)
      .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }], rowCount: 1 }) // Verify alert belongs to business
      .mockResolvedValueOnce({ rows: [mockAlert], rowCount: 1 }); // Update alert

    const response = await request(app)
      .put('/api/alerts/1')
      .send({ status: 'reviewed', description: 'Updated description' });

    expect(response.status).toBe(200);
    expect(response.body.alert.status).toBe('reviewed');
    expect(response.body.alert.description).toBe('Updated description');
    // Should include both fields in update query
    const updateCall = (query as any).mock.calls[1];
    expect(updateCall[0]).toContain('status = $1');
    expect(updateCall[0]).toContain('description = $2');
    expect(updateCall[1]).toEqual(expect.arrayContaining(['reviewed', 'Updated description']));
  });

  it('should return 400 when no valid fields to update', async () => {
    (query as any).mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }], rowCount: 1 }); // Verify alert belongs to business

    const response = await request(app)
      .put('/api/alerts/1')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('No valid fields to update');
  });

  it('should return 404 when alert not found', async () => {
    (query as any).mockResolvedValueOnce({ rows: [], rowCount: 0 }); // Alert doesn't belong to business

    const response = await request(app)
      .put('/api/alerts/999')
      .send({ status: 'reviewed' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Alert not found');
  });

  it('should return 400 when validation fails', async () => {
    const response = await request(app)
      .put('/api/alerts/1')
      .send({ status: 'invalid-status' });

    expect(response.status).toBe(400);
  });
});

