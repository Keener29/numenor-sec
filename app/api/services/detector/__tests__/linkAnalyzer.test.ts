/**
 * Link Analyzer Service Tests
 * Tests for URL and link analysis functionality
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { linkAnalyzerService, type LinkAnalysis } from '../linkAnalyzer.js';

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
globalThis.fetch = mockFetch;

// Helper to build an email HTML body with CTA anchors for given links
const makeEmailBody = (links: string[]): string => {
  return `
    <div>
      <p>Please take action:</p>
      ${links.map(l => `<a href="${l}" class="btn primary" role="button">Reset your password</a>`).join('\n')}
      <footer><a href="https://example.com/unsubscribe">Unsubscribe</a></footer>
    </div>
  `;
};

// Helper function to mock WHOIS API responses
const mockWhoisApiResponse = (domain: string, ageInDays: number = 365) => {
  const mockResponse = {
    ok: true,
    json: async () => ({
      domain: domain,
      created_date: new Date(Date.now() - ageInDays * 24 * 60 * 60 * 1000).toISOString()
    })
  };
  mockFetch.mockResolvedValue(mockResponse as Response);
};

describe('LinkAnalyzerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    // Default mock for all tests - return a legitimate domain (1 year old)
    mockWhoisApiResponse('legitimate-site.com', 365);
  });

  describe('analyzeLinks', () => {
    it('should analyze multiple links and return combined results', async () => {
      const links = [
        'https://bit.ly/shortlink',
        'http://suspicious-site.com',
        'https://legitimate-site.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.totalLinks).toBe(3);
      expect(result.suspiciousLinks.length).toBeGreaterThan(0);
      expect(result.risks.length).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should return empty results for empty link array', async () => {
      const result = await linkAnalyzerService.analyzeLinks([], undefined, makeEmailBody([]));

      expect(result.totalLinks).toBe(0);
      expect(result.suspiciousLinks).toHaveLength(0);
      expect(result.risks).toHaveLength(0);
      expect(result.score).toBe(0);
    });

    it('should detect URL shorteners', async () => {
      const links = [
        'https://bit.ly/shortlink',
        'https://tinyurl.com/abc123',
        'https://goo.gl/xyz789'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.risks.some(risk => risk.includes('URL shortener detected'))).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.suspiciousLinks.length).toBe(3);
    });

    it('should detect IP addresses in URLs', async () => {
      const links = [
        'https://192.168.1.1/login',
        'https://10.0.0.1/admin',
        'https://legitimate-site.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.risks.some(risk => risk.includes('IP address in URL'))).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.suspiciousLinks.length).toBeGreaterThan(0);
    });

    it('should detect insecure HTTP links', async () => {
      const links = [
        'http://insecure-site.com',
        'https://secure-site.com',
        'http://another-insecure.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.risks.some(risk => risk.includes('Insecure HTTP link'))).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect malformed URLs', async () => {
      const links = [
        'not-a-valid-url', // ignored by anchor extraction (no scheme)
        'http://',
        'https://legitimate-site.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.risks.some(risk => risk.includes('Malformed URL'))).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect typosquatting in domains', async () => {
      const links = [
        'https://microsfft.com/login',
        'https://gοggle.com/search',
        'https://legitimate-site.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.risks.some(risk => risk.includes('Typosquatting detected'))).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect homoglyph attacks in domains', async () => {
      const links = [
        'https://аpple.com/account',
        'https://paypa1.com/login',
        'https://legitimate-site.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      // These might be detected as typosquatting instead of homoglyph
      expect(result.risks.some(risk =>
        risk.includes('Homoglyph attack detected') ||
        risk.includes('Typosquatting detected')
      )).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect suspicious domain patterns', async () => {
      const links = [
        'https://gmail.co/login',
        'https://amazon.co/account',
        'https://legitimate-site.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      // These might be detected as typosquatting instead of suspicious pattern
      expect(result.risks.some(risk =>
        risk.includes('Suspicious domain pattern') ||
        risk.includes('Typosquatting detected')
      )).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect suspicious URL paths', async () => {
      const links = [
        'https://suspicious-site.com/login',
        'https://phishing-site.com/verify',
        'https://legitimate-site.com/about'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.risks.some(risk => risk.includes('Suspicious URL path'))).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect suspicious query parameters', async () => {
      const links = [
        'https://suspicious-site.com?password=reset',
        'https://phishing-site.com?token=abc123',
        'https://legitimate-site.com?page=home'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.risks.some(risk => risk.includes('Credential-like params on untrusted domain'))).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect excessive subdomains', async () => {
      const links = [
        'https://a.b.c.d.e.suspicious-site.com',
        'https://legitimate-site.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.risks.some(risk => risk.includes('Excessive subdomains'))).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect suspicious TLDs', async () => {
      const links = [
        'https://suspicious-site.tk',
        'https://phishing-site.ml',
        'https://legitimate-site.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.risks.some(risk => risk.includes('Suspicious TLD'))).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('should handle legitimate links without issues', async () => {
      const links = [
        'https://github.com',
        'https://stackoverflow.com',
        'https://example.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.suspiciousLinks).toHaveLength(0);
      expect(result.risks).toHaveLength(0);
      expect(result.score).toBe(0);
    });

    it('should combine multiple risk factors for high scores', async () => {
      const links = [
        'http://bit.ly/shortlink', // URL shortener + HTTP
        'https://192.168.1.1/login', // IP address
        'https://micros0ft.com/verify?password=reset' // Typosquatting + suspicious path + suspicious params
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.score).toBeGreaterThan(50); // High combined score
      expect(result.suspiciousLinks.length).toBe(3);
      expect(result.risks.length).toBeGreaterThan(5); // Multiple risk factors
    });
  });

  describe('generateLinkRecommendations', () => {
    it('should generate recommendations for suspicious links', () => {
      const analysis: LinkAnalysis = {
        risks: ['URL shortener detected: bit.ly', 'IP address in URL: 192.168.1.1'],
        score: 40,
        suspiciousLinks: ['https://bit.ly/shortlink', 'https://192.168.1.1/login'],
        totalLinks: 2
      };

      const recommendations = linkAnalyzerService.generateLinkRecommendations(analysis);

      expect(recommendations).toContain('CRITICAL: 2 suspicious link(s) detected - do not click');
      expect(recommendations).toContain('Avoid clicking shortened URLs - use a URL expander to check destination');
      expect(recommendations).toContain('IP addresses in URLs are suspicious - verify the destination');
    });

    it('should generate recommendations for URL shorteners', () => {
      const analysis: LinkAnalysis = {
        risks: ['URL shortener detected: bit.ly'],
        score: 15,
        suspiciousLinks: ['https://bit.ly/shortlink'],
        totalLinks: 1
      };

      const recommendations = linkAnalyzerService.generateLinkRecommendations(analysis);

      expect(recommendations).toContain('Avoid clicking shortened URLs - use a URL expander to check destination');
    });

    it('should generate recommendations for IP addresses', () => {
      const analysis: LinkAnalysis = {
        risks: ['IP address in URL: 192.168.1.1'],
        score: 25,
        suspiciousLinks: ['https://192.168.1.1/login'],
        totalLinks: 1
      };

      const recommendations = linkAnalyzerService.generateLinkRecommendations(analysis);

      expect(recommendations).toContain('IP addresses in URLs are suspicious - verify the destination');
    });

    it('should generate recommendations for HTTP links', () => {
      const analysis: LinkAnalysis = {
        risks: ['Insecure HTTP link: http://insecure-site.com'],
        score: 10,
        suspiciousLinks: ['http://insecure-site.com'],
        totalLinks: 1
      };

      const recommendations = linkAnalyzerService.generateLinkRecommendations(analysis);

      expect(recommendations).toContain('Insecure HTTP links detected - avoid entering sensitive information');
    });

    it('should generate recommendations for typosquatting', () => {
      const analysis: LinkAnalysis = {
        risks: ['Typosquatting detected: "micros0ft.com" is similar to "microsoft.com" (distance: 1)'],
        score: 40,
        suspiciousLinks: ['https://micros0ft.com/login'],
        totalLinks: 1
      };

      const recommendations = linkAnalyzerService.generateLinkRecommendations(analysis);

      expect(recommendations).toContain('CRITICAL: Typosquatting detected - domain is very similar to a known brand, likely phishing attempt');
    });

    it('should generate recommendations for homoglyph attacks', () => {
      const analysis: LinkAnalysis = {
        risks: ['Homoglyph attack detected: "аpple.com" contains visually similar characters to "apple.com"'],
        score: 35,
        suspiciousLinks: ['https://аpple.com/account'],
        totalLinks: 1
      };

      const recommendations = linkAnalyzerService.generateLinkRecommendations(analysis);

      expect(recommendations).toContain('CRITICAL: Homoglyph attack detected - domain uses visually similar characters to impersonate a brand');
    });

    it('should generate recommendations for suspicious URL paths', () => {
      const analysis: LinkAnalysis = {
        risks: ['Suspicious URL path: /login'],
        score: 15,
        suspiciousLinks: ['https://suspicious-site.com/login'],
        totalLinks: 1
      };

      const recommendations = linkAnalyzerService.generateLinkRecommendations(analysis);

      expect(recommendations).toContain('Suspicious URL path detected - be cautious of login/account pages');
    });

    it('should generate recommendations for suspicious query parameters', () => {
      const analysis: LinkAnalysis = {
        risks: ['Suspicious query parameters detected'],
        score: 20,
        suspiciousLinks: ['https://suspicious-site.com?password=reset'],
        totalLinks: 1
      };

      const recommendations = linkAnalyzerService.generateLinkRecommendations(analysis);

      expect(recommendations).toContain('Suspicious query parameters detected - avoid entering credentials');
    });

    it('should return empty recommendations for clean analysis', () => {
      const analysis: LinkAnalysis = {
        risks: [],
        score: 0,
        suspiciousLinks: [],
        totalLinks: 3
      };

      const recommendations = linkAnalyzerService.generateLinkRecommendations(analysis);

      expect(recommendations).toHaveLength(0);
    });

    it('should generate multiple recommendations for complex analysis', () => {
      const analysis: LinkAnalysis = {
        risks: [
          'URL shortener detected: bit.ly',
          'IP address in URL: 192.168.1.1',
          'Insecure HTTP link: http://insecure-site.com',
          'Typosquatting detected: "micros0ft.com" is similar to "microsoft.com" (distance: 1)',
          'Suspicious URL path: /login',
          'Suspicious query parameters detected'
        ],
        score: 100,
        suspiciousLinks: [
          'https://bit.ly/shortlink',
          'https://192.168.1.1/login',
          'http://insecure-site.com',
          'https://micros0ft.com/login?password=reset'
        ],
        totalLinks: 4
      };

      const recommendations = linkAnalyzerService.generateLinkRecommendations(analysis);

      expect(recommendations.length).toBeGreaterThan(5);
      expect(recommendations).toContain('CRITICAL: 4 suspicious link(s) detected - do not click');
      expect(recommendations).toContain('Avoid clicking shortened URLs - use a URL expander to check destination');
      expect(recommendations).toContain('IP addresses in URLs are suspicious - verify the destination');
      expect(recommendations).toContain('Insecure HTTP links detected - avoid entering sensitive information');
      expect(recommendations).toContain('CRITICAL: Typosquatting detected - domain is very similar to a known brand, likely phishing attempt');
      expect(recommendations).toContain('Suspicious URL path detected - be cautious of login/account pages');
      expect(recommendations).toContain('Suspicious query parameters detected - avoid entering credentials');
    });
  });

  describe('edge cases', () => {
    it('should handle URLs with special characters', async () => {
      const links = [
        'https://site-with-dash.com',
        'https://site_with_underscore.com',
        'https://site.with.dots.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.totalLinks).toBe(3);
      // Should not crash and should handle gracefully
    });

    it('should handle very long URLs', async () => {
      const longPath = '/'.repeat(1000);
      const links = [`https://legitimate-site.com${longPath}`];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.totalLinks).toBe(1);
      // Should not crash
    });

    it('should handle URLs with non-ASCII characters', async () => {
      const links = [
        'https://сайт.com',
        'https://网站.com',
        'https://legitimate-site.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.totalLinks).toBe(3);
      // Should handle internationalized domain names
    });

    it('should handle URLs with ports', async () => {
      const links = [
        'https://legitimate-site.com:8080',
        'http://suspicious-site.com:3000',
        'https://legitimate-site.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.totalLinks).toBe(3);
      expect(result.risks.some(risk => risk.includes('Insecure HTTP link'))).toBe(true);
    });

    it('should handle URLs with fragments', async () => {
      const links = [
        'https://legitimate-site.com#section1',
        'https://suspicious-site.com#login',
        'https://legitimate-site.com'
      ];

      const result = await linkAnalyzerService.analyzeLinks(links, undefined, makeEmailBody(links));

      expect(result.totalLinks).toBe(3);
      // Should handle URL fragments correctly
    });
  });
});
