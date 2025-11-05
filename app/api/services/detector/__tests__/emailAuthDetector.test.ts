/**
 * Unit tests for Email Authentication Detector
 * Tests SPF, DKIM, and DMARC authentication analysis
 */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';

// Mock the database connection
jest.mock('../../../../db/connection.ts', () => ({
  query: jest.fn()
}));

import { EmailAuthenticationService, type AuthenticationResults } from '../emailAuthDetector.js';

describe('EmailAuthenticationService', () => {
  let authService: EmailAuthenticationService;

  beforeEach(() => {
    authService = new EmailAuthenticationService();
  });

  describe('SPF Authentication Analysis', () => {
    test('should detect SPF pass from Authentication-Results header', () => {
      const headers = {
        'Authentication-Results': 'example.com; spf=pass smtp.mailfrom=example.com'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.spf).toBe('pass');
    });

    test('should detect SPF fail from Authentication-Results header', () => {
      const headers = {
        'Authentication-Results': 'example.com; spf=fail smtp.mailfrom=fake-domain.com'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.spf).toBe('fail');
    });

    test('should detect SPF softfail from Authentication-Results header', () => {
      const headers = {
        'Authentication-Results': 'example.com; spf=softfail smtp.mailfrom=example.com'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.spf).toBe('softfail');
    });

    test('should detect SPF from Received-SPF header', () => {
      const headers = {
        'received-spf': 'pass (example.com: domain of example.com designates 192.168.1.1 as permitted sender)'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.spf).toBe('pass');
    });

    test('should return none when no SPF headers present', () => {
      const headers = {
        'subject': 'Test email'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.spf).toBe('none');
    });
  });

  describe('DKIM Authentication Analysis', () => {
    test('should detect DKIM pass from Authentication-Results header', () => {
      const headers = {
        'Authentication-Results': 'example.com; dkim=pass header.d=example.com'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.dkim).toBe('pass');
    });

    test('should detect DKIM fail from Authentication-Results header', () => {
      const headers = {
        'Authentication-Results': 'example.com; dkim=fail header.d=fake-domain.com'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.dkim).toBe('fail');
    });

    test('should detect DKIM fail when signature exists but no result', () => {
      const headers = {
        'dkim-signature': 'v=1; a=rsa-sha256; c=relaxed/relaxed; d=example.com; s=selector1; h=from:to:subject:date; bh=invalid; b=invalid'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.dkim).toBe('fail');
    });

    test('should return none when no DKIM headers present', () => {
      const headers = {
        'subject': 'Test email'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.dkim).toBe('none');
    });
  });

  describe('DMARC Authentication Analysis', () => {
    test('should detect DMARC pass from Authentication-Results header', () => {
      const headers = {
        'Authentication-Results': 'example.com; dmarc=pass policy.d=example.com'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.dmarc).toBe('pass');
    });

    test('should detect DMARC fail from Authentication-Results header', () => {
      const headers = {
        'Authentication-Results': 'example.com; dmarc=fail policy.d=fake-domain.com'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.dmarc).toBe('fail');
    });

    test('should return none when no DMARC headers present', () => {
      const headers = {
        'subject': 'Test email'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.dmarc).toBe('none');
    });
  });

  describe('Overall Authentication Status', () => {
    test('should return pass when all authentication passes', () => {
      const headers = {
        'Authentication-Results': 'example.com; spf=pass smtp.mailfrom=example.com; dkim=pass header.d=example.com; dmarc=pass policy.d=example.com'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.overall).toBe('pass');
    });

    test('should return fail when all authentication fails', () => {
      const headers = {
        'Authentication-Results': 'example.com; spf=fail smtp.mailfrom=fake.com; dkim=fail header.d=fake.com; dmarc=fail policy.d=fake.com'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.overall).toBe('fail');
    });

    test('should return partial when some authentication passes', () => {
      const headers = {
        'Authentication-Results': 'example.com; spf=pass smtp.mailfrom=example.com; dkim=fail header.d=example.com; dmarc=none'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.overall).toBe('partial');
    });

    test('should return none when no authentication attempted', () => {
      const headers = {
        'subject': 'Test email'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.overall).toBe('none');
    });
  });

  describe('Risk Scoring - Normal Domains', () => {
    test('should give high score for SPF fail', () => {
      const authResults: AuthenticationResults = {
        spf: 'fail',
        dkim: 'pass',
        dmarc: 'pass',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, false);
      expect(result.score).toBe(60); // 50 + 10 (partial)
      expect(result.risks).toContain('SPF authentication failed');
    });

    test('should give medium score for SPF softfail', () => {
      const authResults: AuthenticationResults = {
        spf: 'softfail',
        dkim: 'pass',
        dmarc: 'pass',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, false);
      expect(result.score).toBe(50); // 40 + 10 (partial)
      expect(result.risks).toContain('SPF authentication soft fail');
    });

    test('should give medium score for SPF missing', () => {
      const authResults: AuthenticationResults = {
        spf: 'none',
        dkim: 'pass',
        dmarc: 'pass',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, false);
      expect(result.score).toBe(35); // 25 + 10 (partial)
      expect(result.risks).toContain('No SPF authentication');
    });

    test('should give high score for DKIM fail', () => {
      const authResults: AuthenticationResults = {
        spf: 'pass',
        dkim: 'fail',
        dmarc: 'pass',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, false);
      expect(result.score).toBe(50); // 40 + 10 (partial)
      expect(result.risks).toContain('DKIM authentication failed');
    });

    test('should give medium score for DKIM missing', () => {
      const authResults: AuthenticationResults = {
        spf: 'pass',
        dkim: 'none',
        dmarc: 'pass',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, false);
      expect(result.score).toBe(30); // 20 + 10 (partial)
      expect(result.risks).toContain('No DKIM authentication');
    });

    test('should give high score for DMARC fail', () => {
      const authResults: AuthenticationResults = {
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'fail',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, false);
      expect(result.score).toBe(45); // 35 + 10 (partial)
      expect(result.risks).toContain('DMARC authentication failed');
    });

    test('should give medium score for DMARC missing', () => {
      const authResults: AuthenticationResults = {
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'none',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, false);
      expect(result.score).toBe(30); // 20 + 10 (partial)
      expect(result.risks).toContain('No DMARC authentication');
    });

    test('should give critical score for missing SPF + DKIM', () => {
      const authResults: AuthenticationResults = {
        spf: 'none',
        dkim: 'none',
        dmarc: 'pass',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, false);
      expect(result.score).toBe(95); // 25 + 20 + 0 (DMARC pass) + 40 (combination) + 10 (partial)
      expect(result.risks).toContain('CRITICAL: Both SPF and DKIM authentication missing - high phishing risk');
    });

    test('should give critical score for all authentication failed', () => {
      const authResults: AuthenticationResults = {
        spf: 'fail',
        dkim: 'fail',
        dmarc: 'fail',
        overall: 'fail'
      };

      const result = authService.getAuthenticationRiskScore(authResults, false);
      expect(result.score).toBe(225); // 50 + 40 + 35 + 100 (overall fail)
      expect(result.risks).toContain('Email authentication completely failed');
    });

    test('should give critical score for no authentication at all', () => {
      const authResults: AuthenticationResults = {
        spf: 'none',
        dkim: 'none',
        dmarc: 'none',
        overall: 'none'
      };

      const result = authService.getAuthenticationRiskScore(authResults, false);
      expect(result.score).toBe(205); // 25 + 20 + 20 + 40 (combination) + 100 (overall none)
      expect(result.risks).toContain('CRITICAL: No email authentication at all');
    });
  });

  describe('Risk Scoring - Allow-Listed Domains', () => {
    test('should give reduced score for SPF fail on allow-listed domain', () => {
      const authResults: AuthenticationResults = {
        spf: 'fail',
        dkim: 'pass',
        dmarc: 'pass',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, true);
      expect(result.score).toBe(18); // 15 + 3 (partial)
      expect(result.risks).toContain('SPF authentication failed');
    });

    test('should give minimal score for SPF missing on allow-listed domain', () => {
      const authResults: AuthenticationResults = {
        spf: 'none',
        dkim: 'pass',
        dmarc: 'pass',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, true);
      expect(result.score).toBe(6); // 3 + 3 (partial)
      expect(result.risks).toContain('No SPF authentication');
    });

    test('should give reduced score for DKIM fail on allow-listed domain', () => {
      const authResults: AuthenticationResults = {
        spf: 'pass',
        dkim: 'fail',
        dmarc: 'pass',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, true);
      expect(result.score).toBe(18); // 15 + 3 (partial)
      expect(result.risks).toContain('DKIM authentication failed');
    });

    test('should give minimal score for DKIM missing on allow-listed domain', () => {
      const authResults: AuthenticationResults = {
        spf: 'pass',
        dkim: 'none',
        dmarc: 'pass',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, true);
      expect(result.score).toBe(6); // 3 + 3 (partial)
      expect(result.risks).toContain('No DKIM authentication');
    });

    test('should give reduced score for DMARC fail on allow-listed domain', () => {
      const authResults: AuthenticationResults = {
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'fail',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, true);
      expect(result.score).toBe(15); // 12 + 3 (partial)
      expect(result.risks).toContain('DMARC authentication failed');
    });

    test('should give no score for DMARC missing on allow-listed domain', () => {
      const authResults: AuthenticationResults = {
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'none',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, true);
      expect(result.score).toBe(3); // 0 + 3 (partial)
      expect(result.risks).toContain('No DMARC authentication');
    });

    test('should give minimal score for missing SPF + DKIM on allow-listed domain', () => {
      const authResults: AuthenticationResults = {
        spf: 'none',
        dkim: 'none',
        dmarc: 'pass',
        overall: 'partial'
      };

      const result = authService.getAuthenticationRiskScore(authResults, true);
      expect(result.score).toBe(11); // 3 + 3 + 0 (DMARC) + 2 (combination) + 3 (partial) - much reduced
      expect(result.risks).toContain('Both SPF and DKIM authentication missing - sender domain is allow-listed');
    });

    test('should give reduced score for all authentication failed on allow-listed domain', () => {
      const authResults: AuthenticationResults = {
        spf: 'fail',
        dkim: 'fail',
        dmarc: 'fail',
        overall: 'fail'
      };

      const result = authService.getAuthenticationRiskScore(authResults, true);
      expect(result.score).toBe(62); // 15 + 15 + 12 + 20 (overall fail) - much reduced from 225
      expect(result.risks).toContain('Email authentication failed - sender domain is allow-listed');
    });

    test('should give minimal score for no authentication on allow-listed domain', () => {
      const authResults: AuthenticationResults = {
        spf: 'none',
        dkim: 'none',
        dmarc: 'none',
        overall: 'none'
      };

      const result = authService.getAuthenticationRiskScore(authResults, true);
      expect(result.score).toBe(13); // 3 + 3 + 0 + 2 (combination) + 5 (overall none) - much reduced from 185
      expect(result.risks).toContain('No email authentication - sender domain is allow-listed');
    });
  });

  describe('Recommendation Generation', () => {
    test('should generate SPF recommendations', () => {
      const risks = ['SPF authentication failed'];
      const recommendations = authService.generateAuthenticationRecommendations(risks);
      
      expect(recommendations).toContain('SPF authentication issue detected - verify sender domain legitimacy');
    });

    test('should generate DKIM recommendations', () => {
      const risks = ['DKIM authentication failed'];
      const recommendations = authService.generateAuthenticationRecommendations(risks);
      
      expect(recommendations).toContain('DKIM authentication issue detected - email may be spoofed');
    });

    test('should generate DMARC recommendations', () => {
      const risks = ['DMARC authentication failed'];
      const recommendations = authService.generateAuthenticationRecommendations(risks);
      
      expect(recommendations).toContain('DMARC authentication issue detected - high risk of email spoofing');
    });

    test('should generate critical recommendations for complete failure', () => {
      const risks = ['Email authentication completely failed'];
      const recommendations = authService.generateAuthenticationRecommendations(risks);
      
      expect(recommendations).toContain('CRITICAL: All email authentication failed - do not trust this email');
    });

    test('should generate critical recommendations for missing SPF + DKIM', () => {
      const risks = ['CRITICAL: Both SPF and DKIM authentication missing - high phishing risk'];
      const recommendations = authService.generateAuthenticationRecommendations(risks);
      
      expect(recommendations).toContain('CRITICAL: No SPF or DKIM authentication - this email is highly suspicious and likely phishing');
    });
  });

  describe('Real-world Email Scenarios', () => {
    test('should handle legitimate Gmail email with full authentication', () => {
      const headers = {
        'Authentication-Results': 'gmail.com; spf=pass smtp.mailfrom=gmail.com; dkim=pass header.d=gmail.com; dmarc=pass policy.d=gmail.com',
        'received-spf': 'pass (gmail.com: domain of gmail.com designates 209.85.128.1 as permitted sender)',
        'dkim-signature': 'v=1; a=rsa-sha256; c=relaxed/relaxed; d=gmail.com; s=20210112; h=from:to:subject:date; bh=valid; b=valid'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.spf).toBe('pass');
      expect(result.dkim).toBe('pass');
      expect(result.dmarc).toBe('pass');
      expect(result.overall).toBe('pass');

      const riskScore = authService.getAuthenticationRiskScore(result, false);
      expect(riskScore.score).toBe(0); // No risks for fully authenticated email
    });

    test('should handle phishing email with failed authentication', () => {
      const headers = {
        'Authentication-Results': 'example.com; spf=fail smtp.mailfrom=fake-bank.com; dkim=fail header.d=fake-bank.com; dmarc=fail policy.d=fake-bank.com'
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.spf).toBe('fail');
      expect(result.dkim).toBe('fail');
      expect(result.dmarc).toBe('fail');
      expect(result.overall).toBe('fail');

      const riskScore = authService.getAuthenticationRiskScore(result, false);
      expect(riskScore.score).toBe(225); // High risk score
      expect(riskScore.risks).toContain('Email authentication completely failed');
    });

    test('should handle internal email with missing authentication (allow-listed)', () => {
      const headers = {
        'subject': 'Internal company email'
        // No authentication headers - common for internal emails
      };

      const result = authService.analyzeEmailAuthentication(headers);
      expect(result.spf).toBe('none');
      expect(result.dkim).toBe('none');
      expect(result.dmarc).toBe('none');
      expect(result.overall).toBe('none');

      const riskScore = authService.getAuthenticationRiskScore(result, true); // Allow-listed
      expect(riskScore.score).toBe(13); // Low risk score for trusted domain
      expect(riskScore.risks).toContain('No email authentication - sender domain is allow-listed');
    });
  });
});
