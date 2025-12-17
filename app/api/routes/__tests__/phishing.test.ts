/**
 * Phishing Routes Tests
 * Tests phishing detection endpoints including manual scans, statistics, patterns, and recommendations
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import phishingRoutes from '../phishing.js';
import { type AuthRequest } from '../../middleware/auth.js';
import { errorHandler } from '../../middleware/errorHandler.js';

// Mock dependencies
jest.mock('../../../db/connection.js', () => ({
  query: jest.fn()
}));

jest.mock('../../../utils/logger.js', () => ({
  securityLogger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
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

// Mock phishingDetector
const mockGetThreatStatistics = jest.fn();
jest.mock('../../services/detector/phishingDetector.js', () => ({
  phishingDetector: {
    getThreatStatistics: (...args: any[]) => mockGetThreatStatistics(...args)
  }
}));

// Mock emailMonitor
const mockTriggerBusinessScan = jest.fn();
const mockGetMonitoringStats = jest.fn();
const mockGetMonitoringStatus = jest.fn();
const mockInitialize = jest.fn();
const mockStopMonitoring = jest.fn();
jest.mock('../../services/emailMonitor/index.js', () => ({
  emailMonitor: {
    triggerBusinessScan: (...args: any[]) => mockTriggerBusinessScan(...args),
    getMonitoringStats: (...args: any[]) => mockGetMonitoringStats(...args),
    getMonitoringStatus: (...args: any[]) => mockGetMonitoringStatus(...args),
    initialize: (...args: any[]) => mockInitialize(...args),
    stopMonitoring: (...args: any[]) => mockStopMonitoring(...args)
  }
}));

import { query } from '../../../db/connection.js';

describe('POST /api/phishing/scan', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/phishing', phishingRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should trigger scan for all business emails', async () => {
    mockTriggerBusinessScan.mockResolvedValue(undefined as never);

    const response = await request(app)
      .post('/api/phishing/scan')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('all business emails');
    expect(mockTriggerBusinessScan).toHaveBeenCalledWith(1);
  });

  it('should trigger scan for specific email', async () => {
    const mockEmail = { id: 10, email_address: 'test@example.com' };
    (query as any).mockResolvedValueOnce({ rows: [mockEmail] });
    mockTriggerBusinessScan.mockResolvedValue(undefined as never);

    const response = await request(app)
      .post('/api/phishing/scan')
      .send({ emailId: 10 });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.emailId).toBe(10);
    expect(response.body.message).toContain('test@example.com');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INNER JOIN oauth_tokens'),
      [10, 1]
    );
  });

  it('should return 404 when email not found or not connected', async () => {
    (query as any).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .post('/api/phishing/scan')
      .send({ emailId: 999 });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain('not found');
  });

  it('should return 403 when trying to scan different business', async () => {
    const response = await request(app)
      .post('/api/phishing/scan')
      .send({ businessId: 999 });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('Access denied');
  });

  it('should return 400 when validation fails', async () => {
    const response = await request(app)
      .post('/api/phishing/scan')
      .send({ emailId: -1 });

    expect(response.status).toBe(400);
  });
});

describe('GET /api/phishing/statistics', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/phishing', phishingRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should return statistics successfully', async () => {
    const mockThreatStats = [
      { threat_level: 'high', count: 5 },
      { threat_level: 'critical', count: 2 },
      { threat_level: 'medium', count: 3 }
    ];
    const mockMonitoringStats = {
      emails: { total_emails: 10, connected_emails: 8 },
      scans: { total_scans: 100, successful_scans: 95 }
    };
    const mockRecentAlerts = {
      rows: [
        { threat_level: 'high', status: 'pending', subject: 'Test' },
        { threat_level: 'critical', status: 'reviewed', subject: 'Test2' }
      ]
    };

    mockGetThreatStatistics.mockResolvedValueOnce(mockThreatStats as never);
    mockGetMonitoringStats.mockResolvedValueOnce(mockMonitoringStats as never);
    (query as any).mockResolvedValueOnce(mockRecentAlerts);

    const response = await request(app)
      .get('/api/phishing/statistics');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // totalAlerts is the length of filtered threatStats array (3 items: high, critical, medium)
    // totalAlerts is the length of filtered threatStats array (3 items: high, critical, medium)
    expect(response.body.statistics.summary.totalAlerts).toBe(3);
    // Individual counts are calculated from original threatStats array using filter().length
    // Each filter returns array of matching items, so length is count of items with that threat_level
    expect(response.body.statistics.summary.criticalAlerts).toBe(1); // 1 item with threat_level='critical'
    expect(response.body.statistics.summary.highAlerts).toBe(1); // 1 item with threat_level='high'
    expect(response.body.statistics.summary.mediumAlerts).toBe(1); // 1 item with threat_level='medium'
    expect(response.body.statistics.monitoring).toEqual(mockMonitoringStats);
  });

  it('should filter out low threat levels from statistics', async () => {
    const mockThreatStats = [
      { threat_level: 'high', count: 5 },
      { threat_level: 'low', count: 10 } // Should be filtered out
    ];
    mockGetThreatStatistics.mockResolvedValueOnce(mockThreatStats as never);
    mockGetMonitoringStats.mockResolvedValueOnce({ emails: {}, scans: {} } as never);
    (query as any).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/phishing/statistics');

    // totalAlerts is the length of filtered array (only high remains, low filtered)
    expect(response.body.statistics.summary.totalAlerts).toBe(1);
  });

  it('should handle errors gracefully and return defaults', async () => {
    mockGetThreatStatistics.mockRejectedValueOnce(new Error('Stats failed') as never);
    mockGetMonitoringStats.mockRejectedValueOnce(new Error('Monitoring failed') as never);
    (query as any).mockRejectedValueOnce(new Error('Query failed'));

    const response = await request(app)
      .get('/api/phishing/statistics');

    // Should return 200 with default values instead of error
    expect(response.status).toBe(200);
    expect(response.body.statistics.summary.totalAlerts).toBe(0);
    expect(response.body.statistics.threatBreakdown).toEqual([]);
  });

  it('should use custom days parameter', async () => {
    mockGetThreatStatistics.mockResolvedValueOnce([] as never);
    mockGetMonitoringStats.mockResolvedValueOnce({ emails: {}, scans: {} } as never);
    (query as any).mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/phishing/statistics?days=7');

    expect(mockGetThreatStatistics).toHaveBeenCalledWith(1, 7);
  });

  it('should count pending alerts correctly', async () => {
    const mockRecentAlerts = {
      rows: [
        { threat_level: 'high', status: 'pending' },
        { threat_level: 'critical', status: 'pending' },
        { threat_level: 'medium', status: 'reviewed' } // Not pending
      ]
    };
    mockGetThreatStatistics.mockResolvedValueOnce([] as never);
    mockGetMonitoringStats.mockResolvedValueOnce({ emails: {}, scans: {} } as never);
    (query as any).mockResolvedValueOnce(mockRecentAlerts);

    const response = await request(app)
      .get('/api/phishing/statistics');

    // Only high and critical are counted (medium filtered out, but only pending ones count)
    expect(response.body.statistics.summary.pendingAlerts).toBe(2);
  });
});

describe('GET /api/phishing/patterns', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/phishing', phishingRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should return detected patterns with descriptions', async () => {
    const mockPatternStats = {
      rows: [
        { alert_type: 'ceo_fraud', threat_level: 'high', count: '5', last_detected: new Date() },
        { alert_type: 'suspicious_attachments', threat_level: 'medium', count: '3', last_detected: new Date() }
      ]
    };
    (query as any).mockResolvedValueOnce(mockPatternStats);

    const response = await request(app)
      .get('/api/phishing/patterns');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.patterns).toHaveLength(2);
    expect(response.body.patterns[0].description).toContain('CEO fraud');
    expect(response.body.patterns[1].description).toContain('malicious file attachments');
  });

  it('should return unknown description for unrecognized patterns', async () => {
    const mockPatternStats = {
      rows: [
        { alert_type: 'unknown_pattern', threat_level: 'high', count: '1', last_detected: new Date() }
      ]
    };
    (query as any).mockResolvedValueOnce(mockPatternStats);

    const response = await request(app)
      .get('/api/phishing/patterns');

    expect(response.body.patterns[0].description).toBe('Unknown pattern');
  });

  it('should return empty array when no patterns found', async () => {
    (query as any).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/phishing/patterns');

    expect(response.body.patterns).toEqual([]);
    expect(response.body.totalPatterns).toBe(0);
  });
});

describe('GET /api/phishing/monitoring/status', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/phishing', phishingRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should return monitoring status successfully', async () => {
    const mockStatus = { isMonitoring: true, mode: 'event-driven' };
    const mockStats = {
      emails: { total_emails: 10 },
      scans: { total_scans: 100 }
    };
    mockGetMonitoringStatus.mockReturnValueOnce(mockStatus);
    mockGetMonitoringStats.mockResolvedValueOnce(mockStats as never);

    const response = await request(app)
      .get('/api/phishing/monitoring/status');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.monitoring.status).toEqual(mockStatus);
    expect(response.body.monitoring.statistics).toEqual(mockStats);
  });

  it('should handle errors gracefully and return defaults', async () => {
    mockGetMonitoringStatus.mockImplementationOnce(() => {
      throw new Error('Status failed');
    });
    mockGetMonitoringStats.mockRejectedValueOnce(new Error('Stats failed') as never);

    const response = await request(app)
      .get('/api/phishing/monitoring/status');

    expect(response.status).toBe(200);
    expect(response.body.monitoring.status.isMonitoring).toBe(false);
    expect(response.body.monitoring.statistics.emails.total_emails).toBe(0);
  });
});

describe('POST /api/phishing/monitoring/start', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/phishing', phishingRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should initialize monitoring service', async () => {
    mockInitialize.mockResolvedValueOnce(undefined as never);

    const response = await request(app)
      .post('/api/phishing/monitoring/start');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('initialized');
    expect(mockInitialize).toHaveBeenCalled();
  });

  it('should handle initialization errors', async () => {
    mockInitialize.mockRejectedValueOnce(new Error('Init failed') as never);

    const response = await request(app)
      .post('/api/phishing/monitoring/start');

    expect(response.status).toBe(500);
  });
});

describe('POST /api/phishing/monitoring/stop', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/phishing', phishingRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should stop monitoring service', async () => {
    mockStopMonitoring.mockReturnValueOnce(undefined as never);

    const response = await request(app)
      .post('/api/phishing/monitoring/stop');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('stopped');
    expect(mockStopMonitoring).toHaveBeenCalled();
  });
});

describe('GET /api/phishing/recommendations', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/phishing', phishingRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
  });

  it('should return recommendations with threat summary', async () => {
    const mockThreats = [
      { threat_level: 'critical', alert_type: 'ceo_fraud', created_at: new Date(), email_address: 'test@example.com' },
      { threat_level: 'high', alert_type: 'suspicious_attachments', created_at: new Date(), email_address: 'test@example.com' }
    ];
    (query as any).mockResolvedValueOnce({ rows: mockThreats });

    const response = await request(app)
      .get('/api/phishing/recommendations');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.recommendations).toBeDefined();
    expect(response.body.threatSummary.totalThreats).toBe(2);
    // Should include critical threat recommendation
    expect(response.body.recommendations.some((r: any) => r.priority === 'critical')).toBe(true);
    // Should include CEO fraud recommendation
    expect(response.body.recommendations.some((r: any) => r.category === 'bec_protection')).toBe(true);
    // Should include baseline recommendations
    expect(response.body.recommendations.some((r: any) => r.category === 'user_education')).toBe(true);
  });

  it('should return onboarding recommendations when no threats', async () => {
    (query as any).mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get('/api/phishing/recommendations');

    expect(response.status).toBe(200);
    // Should include onboarding recommendations when no threats
    expect(response.body.recommendations.some((r: any) => r.category === 'onboarding')).toBe(true);
    expect(response.body.threatSummary.totalThreats).toBe(0);
  });

  it('should trigger high threat volume recommendation', async () => {
    // Create 6 high threats to trigger the >5 threshold
    const mockThreats = Array.from({ length: 6 }, () => ({
      threat_level: 'high',
      alert_type: 'suspicious_domain',
      created_at: new Date(),
      email_address: 'test@example.com'
    }));
    (query as any).mockResolvedValueOnce({ rows: mockThreats });

    const response = await request(app)
      .get('/api/phishing/recommendations');

    expect(response.status).toBe(200);
    // Should include high threat volume recommendation
    expect(response.body.recommendations.some((r: any) => 
      r.category === 'security_enhancement' && r.priority === 'high'
    )).toBe(true);
  });

  it('should include top patterns in threat summary', async () => {
    const mockThreats = [
      { threat_level: 'high', alert_type: 'ceo_fraud', created_at: new Date(), email_address: 'test@example.com' },
      { threat_level: 'high', alert_type: 'ceo_fraud', created_at: new Date(), email_address: 'test@example.com' },
      { threat_level: 'medium', alert_type: 'suspicious_attachments', created_at: new Date(), email_address: 'test@example.com' }
    ];
    (query as any).mockResolvedValueOnce({ rows: mockThreats });

    const response = await request(app)
      .get('/api/phishing/recommendations');

    expect(response.status).toBe(200);
    expect(response.body.threatSummary.topPatterns).toBeDefined();
    // CEO fraud should be first (count: 2)
    expect(response.body.threatSummary.topPatterns[0].pattern).toBe('ceo_fraud');
    expect(response.body.threatSummary.topPatterns[0].count).toBe(2);
  });
});

