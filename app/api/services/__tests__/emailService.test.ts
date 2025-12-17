/**
 * @file emailService.test.ts
 */
// Mock logger so tests don't explode
jest.mock('../../../utils/logger.js', () => ({
emailLogger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
}
}));

// Mock tokenService (even if not used directly)
jest.mock('../../utils/tokenService.js', () => ({
tokenService: {
    generateApprovalToken: jest.fn().mockReturnValue('mock-token')
}
}));

// Mock error handler
jest.mock('../errorHandler.js', () => {
const original = jest.requireActual('../errorHandler.js');
return {
    ErrorFactory: {
    emailService: jest.fn((code, msg, status) => ({
        code,
        message: msg,
        status
    }))
    },
    ErrorCodes: original.ErrorCodes
};
});

jest.mock('../../utils/emailUtils.js', () => ({
  ...jest.requireActual('../../utils/emailUtils.js'),
  getOAuthProvider: jest.fn().mockResolvedValue('gmail')
}));

describe('emailService', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user@test.com';
    process.env.SMTP_PASS = 'password123';
    jest.doMock('nodemailer', () => ({
        createTransport: jest.fn()
      }));
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  // ============================================================================
  // createTransporter()
  // ============================================================================
  test('createTransporter creates a nodemailer transporter with correct config', async () => {
    const nodemailer = await import('nodemailer'); 
    const mockTransporter = {};
    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);
    const { createTransporter } = require('../emailService.js');
    const transporter = createTransporter();

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.test.com',
      port: 587,
      secure: false,
      auth: {
        user: 'user@test.com',
        pass: 'password123'
      },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 60000
    });

    expect(transporter).toBe(mockTransporter);
  });

  test('createTransporter throws when env vars missing', () => {
    delete process.env.SMTP_USER;

    try {
      const { createTransporter } = require('../emailService.js');
      createTransporter();
    } catch (err: any) {
      expect(err.code).toBe('EMAIL_SERVICE_NOT_CONFIGURED');
      return;
    }
    throw new Error('Expected error but function did not throw');
  });

  // ============================================================================
  // generatePermissionRequestTemplate()
  // ============================================================================
  test('generatePermissionRequestTemplate returns correct subject/text/html', async () => {
    const { generatePermissionRequestTemplate } = require('../emailService.js');
    const template = await generatePermissionRequestTemplate({
      businessName: 'Test Corp',
      businessEmail: 'contact@test.com',
      emailAddress: 'victim@test.com',
      businessId: 123,
      approvalToken: 'abc123'
    });

    expect(template.subject).toContain('Permission Request');
    expect(template.html).toContain('Test Corp');
    expect(template.text).toContain('Test Corp');
    expect(template.html).toContain('victim@test.com');
    expect(template.html).toContain('abc123');
  });

  test('generatePermissionRequestTemplate handles missing businessName', async () => {
    const { generatePermissionRequestTemplate } = require('../emailService.js');
    const template = await generatePermissionRequestTemplate({
      businessName: '',
      businessEmail: 'contact@test.com',
      emailAddress: 'victim@test.com',
      businessId: 123,
      approvalToken: 'abc123'
    });

    expect(template.subject).toContain('Permission Request');
    expect(template.html).toContain('the business');
  });

  // ============================================================================
  // generateThreatAlertTemplate()
  // ============================================================================
  test('generateThreatAlertTemplate produces valid template', () => {
    const { generateThreatAlertTemplate } = require('../emailService.js');
    const template = generateThreatAlertTemplate({
      businessName: 'Test Corp',
      ownerEmail: 'owner@test.com',
      monitoredEmail: 'inbox@test.com',
      emailMessage: {
        id: '1',
        subject: 'Suspicious Email',
        body: 'This is a suspicious email',
        sender: { address: 'attacker@test.com' },
        recipient: { address: 'victim@test.com' },
        timestamp: new Date(),
        headers: {
          'Content-Type': 'text/html'
        }
      },
      threatAssessment: {
        threatLevel: 'low',
        confidence: 50,
        detectedPatterns: ['phishing_link', 'spoofing_attempt'],
        riskFactors: ['unknown sender', 'malicious link'],
        recommendations: ['delete email', 'notify security team'],
        authenticationResults: {
          spf: 'pass',
          dkim: 'pass',
          dmarc: 'pass',
          overall: 'pass',
        }
      }
    });

    expect(template.subject).toContain('SECURITY ALERT');
    expect(template.html).toContain('Test Corp');
    expect(template.html).toContain('phishing_link'.replace('_', ' ').toUpperCase());
    expect(template.text).toContain('Suspicious Email');
  });
});
