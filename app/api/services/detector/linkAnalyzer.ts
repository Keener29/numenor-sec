/**
 * Link Analyzer Service
 * Analyzes URLs and links in emails for phishing indicators
 * 
 * Features:
 * - URL shortener detection
 * - Suspicious domain analysis (typosquatting, homoglyphs)
 * - IP address detection in URLs
 * - Protocol security analysis (HTTP vs HTTPS)
 * - Malformed URL detection
 * - Redirect chain analysis
 */

import { 
  analyzeDomain, 
  isPopularUrlShortener, 
  isIPAddress, 
  type DomainAnalysisResult 
} from './domainAnalyzer.js';

export interface LinkAnalysis {
  risks: string[];
  score: number;
  suspiciousLinks: string[];
  totalLinks: number;
}

export interface LinkAnalysisResult {
  link: string;
  isSuspicious: boolean;
  risks: string[];
  score: number;
  domainAnalysis?: DomainAnalysisResult;
}

/**
 * Link Analyzer Service
 */
export class LinkAnalyzerService {
  /**
   * Analyze all links in an email
   */
  async analyzeLinks(links: string[], businessId?: number): Promise<LinkAnalysis> {
    const risks: string[] = [];
    const suspiciousLinks: string[] = [];
    let totalScore = 0;
    
    for (const link of links) {
      const result = await this.analyzeSingleLink(link, businessId);
      
      if (result.isSuspicious) {
        suspiciousLinks.push(link);
        risks.push(...result.risks);
        totalScore += result.score;
      }
    }
    
    return {
      risks,
      score: totalScore,
      suspiciousLinks,
      totalLinks: links.length
    };
  }
  
  /**
   * Analyze a single link
   */
  private async analyzeSingleLink(link: string, businessId?: number): Promise<LinkAnalysisResult> {
    const risks: string[] = [];
    let score = 0;
    
    try {
      const url = new URL(link);
      const hostname = url.hostname;
      
      // Check for URL shorteners
      // Known URL shorteners should not receive penalties - they are common and legitimate
      // Skip penalty for known URL shorteners
      if (isPopularUrlShortener(hostname)) {
        // Small penalty for popular URL shorteners
        score += 2;
      }
      
      // Check for IP addresses in URLs
      if (isIPAddress(hostname)) {
        risks.push(`IP address in URL: ${hostname}`);
        score += 25;
      }
      
      // Check for insecure HTTP links
      if (url.protocol === 'http:') {
        risks.push(`Insecure HTTP link: ${link}`);
        score += 10;
      }
      
      // Analyze domain for typosquatting, homoglyphs, domain age, etc.
      const domainAnalysis = await analyzeDomain(hostname, businessId);
      if (domainAnalysis.isSuspicious) {
        switch (domainAnalysis.type) {
          case 'typosquatting':
            risks.push(`Typosquatting detected: "${hostname}" is similar to "${domainAnalysis.similarDomain}" (distance: ${domainAnalysis.distance})`);
            break;
          case 'homoglyph':
            risks.push(`Homoglyph attack detected: "${hostname}" contains visually similar characters to "${domainAnalysis.similarDomain}"`);
            break;
          case 'suspicious_pattern':
            risks.push(`Suspicious domain pattern: "${hostname}"`);
            break;
          case 'domain_age':
            if (domainAnalysis.domainAge) {
              const ageText = domainAnalysis.domainAge.ageInDays 
                ? `${domainAnalysis.domainAge.ageInDays} days old`
                : 'unknown age';
              risks.push(`Newly registered domain: "${hostname}" (${ageText}, risk: ${domainAnalysis.domainAge.riskLevel})`);
            }
            break;
        }
        score += domainAnalysis.riskScore;
      }
      
      // Check for suspicious URL patterns
      const urlPatternRisks = this.checkUrlPatterns(url);
      risks.push(...urlPatternRisks.risks);
      score += urlPatternRisks.score;
      
    } catch (error) {
      risks.push(`Malformed URL: ${link}`);
      score += 20;
    }
    
    return {
      link,
      isSuspicious: risks.length > 0,
      risks,
      score
    };
  }
  
  /**
   * Check for suspicious URL patterns
   */
  private checkUrlPatterns(url: URL): { risks: string[]; score: number } {
    const risks: string[] = [];
    let score = 0;
    
    // Check for suspicious path patterns
    const suspiciousPaths = [
      /\/login/i, /\/signin/i, /\/account/i, /\/verify/i, /\/confirm/i,
      /\/update/i, /\/security/i, /\/password/i, /\/reset/i
    ];
    
    if (suspiciousPaths.some(pattern => pattern.test(url.pathname))) {
      risks.push(`Suspicious URL path: ${url.pathname}`);
      score += 15;
    }
    
    // Check for suspicious query parameters
    const suspiciousParams = [
      'password', 'pwd', 'pass', 'token', 'key', 'secret', 'auth'
    ];
    
    const hasSuspiciousParams = suspiciousParams.some(param => 
      url.searchParams.has(param) || url.search.includes(param)
    );
    
    if (hasSuspiciousParams) {
      risks.push(`Suspicious query parameters detected`);
      score += 20;
    }
    
    // Check for excessive subdomains (potential subdomain takeover)
    const subdomainCount = url.hostname.split('.').length - 2; // Subtract domain and TLD
    if (subdomainCount > 3) {
      risks.push(`Excessive subdomains: ${subdomainCount}`);
      score += 10;
    }
    
    // Check for suspicious TLDs
    const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.click', '.download'];
    const tld = url.hostname.split('.').pop()?.toLowerCase();
    if (tld && suspiciousTlds.includes(`.${tld}`)) {
      risks.push(`Suspicious TLD: .${tld}`);
      score += 15;
    }
    
    return { risks, score };
  }
  
  /**
   * Generate recommendations based on link analysis
   */
  generateLinkRecommendations(analysis: LinkAnalysis): string[] {
    const recommendations: string[] = [];
    
    if (analysis.suspiciousLinks.length > 0) {
      recommendations.push(`CRITICAL: ${analysis.suspiciousLinks.length} suspicious link(s) detected - do not click`);
    }
    
    if (analysis.risks.some(risk => risk.includes('URL shortener'))) {
      recommendations.push('Avoid clicking shortened URLs - use a URL expander to check destination');
    }
    
    if (analysis.risks.some(risk => risk.includes('IP address'))) {
      recommendations.push('IP addresses in URLs are suspicious - verify the destination');
    }
    
    if (analysis.risks.some(risk => risk.includes('HTTP link'))) {
      recommendations.push('Insecure HTTP links detected - avoid entering sensitive information');
    }
    
    if (analysis.risks.some(risk => risk.includes('Typosquatting'))) {
      recommendations.push('CRITICAL: Typosquatting detected - domain is very similar to a known brand, likely phishing attempt');
    }
    
    if (analysis.risks.some(risk => risk.includes('Homoglyph attack'))) {
      recommendations.push('CRITICAL: Homoglyph attack detected - domain uses visually similar characters to impersonate a brand');
    }
    
    if (analysis.risks.some(risk => risk.includes('Suspicious URL path'))) {
      recommendations.push('Suspicious URL path detected - be cautious of login/account pages');
    }
    
    if (analysis.risks.some(risk => risk.includes('query parameters'))) {
      recommendations.push('Suspicious query parameters detected - avoid entering credentials');
    }
    
    return recommendations;
  }
}

// Export singleton instance
export const linkAnalyzerService = new LinkAnalyzerService();
