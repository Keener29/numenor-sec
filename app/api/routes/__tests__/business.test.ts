import express from 'express';
import request from 'supertest';
import { query } from '../../../db/connection.js';
import businessRoutes from '../business.js';
import { type AuthRequest } from '../../middleware/auth.js';

jest.mock('../../../db/connection.js', () => ({
    query: jest.fn()
  }));

jest.mock('../../middleware/auth.js', () => ({
    authenticateToken: (req: AuthRequest, resp: any, next: any) => {
        req.user = { id: 1, email: 'test@example.com', business_id: 1 };
        next();
    },
    requireBusiness: (req: AuthRequest, res: any, next: any) => next()
}));

jest.mock('../../middleware/validation.js', () => ({
  validateBody: () => (req: any, res: any, next: any) => next()
}));

describe('Business Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    app.use((req: any, res, next) => {
      Object.defineProperty(req, 'ip', { value: '127.0.0.1' });
      req.get = jest.fn((header) => header === 'User-Agent' ? 'test-agent' : undefined);
      next();
    });

    app.use('/api/business', businessRoutes);
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------
  // GET /
  // ---------------------------------------------------------
  it('GET / should return business info', async () => {
    const mockRow = {
      id: 123,
      business_name: 'Test Co',
      address: '123 Road',
      phone: '111-222',
      website: 'https://test.com',
      member_count: 5,
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-02')
    };

    (query as jest.Mock).mockResolvedValueOnce({
      rows: [mockRow],
      rowCount: 1
    });

    const res = await request(app).get('/api/business');

    expect(res.status).toBe(200);
    expect(res.body.business.name).toBe('Test Co');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('GET / should return 404 if business not found', async () => {
    (query as jest.Mock).mockResolvedValueOnce({
      rows: [],
      rowCount: 0
    });

    const res = await request(app).get('/api/business');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Business not found');
  });

  // ---------------------------------------------------------
  // PUT /
  // ---------------------------------------------------------
  it('PUT / should update business successfully', async () => {
    const updatedRow = {
      id: 1,
      business_name: 'New Name',
      address: 'New Address',
      phone: '555-9999',
      website: 'https://new.com',
      member_count: 10,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };

    // First update query returns updated business
    (query as jest.Mock)
      .mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 }) // UPDATE query
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });          // INSERT security event

    const res = await request(app)
      .put('/api/business')
      .send({
        name: 'New Name',
        address: 'New Address',
        phone: '555-9999',
        website: 'https://new.com',
        memberCount: 10
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Business updated successfully');

    // Verify both queries executed
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO security_events'),
        [
          1,
          'business_updated',
          'Business information updated',
          JSON.stringify({ ipAddress: '127.0.0.1', userAgent: 'test-agent' }) // metadata
        ]
    );
  });

  it('PUT / should return 400 when no fields are provided', async () => {
    const res = await request(app)
      .put('/api/business')
      .send({}); // No valid fields

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No valid fields to update');
    expect(query).not.toHaveBeenCalled();
  });

  it('PUT / should return 404 if update returns no rows', async () => {
    (query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .put('/api/business')
      .send({ name: 'Something' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Business not found');
  });

  // ---------------------------------------------------------
  // GET /stats
  // ---------------------------------------------------------
  it('GET /stats should return business statistics', async () => {
    (query as jest.Mock)
      // emails
      .mockResolvedValueOnce({ rows: [{ count: '5' }] })
      // alerts total
      .mockResolvedValueOnce({ rows: [{ count: '20' }] })
      // pending alerts
      .mockResolvedValueOnce({ rows: [{ count: '3' }] })
      // recent alerts
      .mockResolvedValueOnce({ rows: [{ count: '2' }] })
      // connected emails
      .mockResolvedValueOnce({ rows: [{ count: '4' }] });

    const res = await request(app).get('/api/business/stats');

    expect(res.status).toBe(200);
    expect(res.body.stats.totalEmails).toBe(5);
    expect(res.body.stats.totalAlerts).toBe(20);
    expect(res.body.stats.pendingAlerts).toBe(3);
    expect(res.body.stats.recentAlerts).toBe(2);
    expect(res.body.stats.connectedEmails).toBe(4);

    expect(query).toHaveBeenCalledTimes(5);
  });
});
