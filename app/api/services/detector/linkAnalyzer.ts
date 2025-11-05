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
import { isTrustedDomain } from './domainAgeAnalyzer.js';

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
const KNOWN_SAFE_HTTP_DOMAINS = [
  'w3.org',             // HTML DTDs
  'akamai.net',
  'cloudfront.net',
  'mailchimp.com',
  'mandrillapp.com',
  'sendgrid.net',
  'acemsr.aircanada.com', // add real ESP/CDN hosts you see
  'res.mail.aircanada.com'
];
// Namespace / spec URLs (not real links)
const SAFE_NAMESPACE_PREFIXES = [
  "http://www.w3.org/",
  "https://www.w3.org/",
  "http://schemas.microsoft.com/",
  "http://xml.apache.org/",
  "http://purl.org/", // RDF vocabularies
];
/**
 * Link Analyzer Service
 */
export class LinkAnalyzerService {
  
  private isImageLink(link: string): boolean {
    return /\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(link);
  }

  private isClickAction(anchor: string): boolean {
    return /(click|login|reset|verify|update|account|confirm)/i.test(anchor);
  }

  private isNamespaceURL(urlString: string): boolean {
    return SAFE_NAMESPACE_PREFIXES.some(prefix => urlString.startsWith(prefix));
  }
  /**
   * Analyze all links in an email
   */
  async analyzeLinks(links: string[], businessId?: number): Promise<LinkAnalysis> {
    const risks: string[] = [];
    const suspiciousLinks: string[] = [];
    let totalScore = 0;
    
    // Extract unique domains to avoid redundant domain analysis
    const domainAnalysisCache = new Map<string, { domainAnalysis: DomainAnalysisResult; trustedDomain: boolean }>();
    const uniqueDomains = new Set<string>();
    
    // First pass: extract unique domains from all links
    for (const link of links) {
      try {
        const url = new URL(link);
        uniqueDomains.add(url.hostname);
      } catch {
        // Invalid URL, will be handled in analyzeSingleLink
      }
    }
    
    // Pre-analyze each unique domain once
    for (const domain of uniqueDomains) {
      const trustedDomain = await isTrustedDomain(domain, businessId);
      const domainAnalysis = await analyzeDomain(domain, businessId);
      domainAnalysisCache.set(domain, { domainAnalysis, trustedDomain });
    }
    
    // Second pass: analyze each link using cached domain analysis
    for (const link of links) {
      const result = await this.analyzeSingleLink(link, businessId, domainAnalysisCache);
      
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
  private async analyzeSingleLink(
    link: string, 
    businessId?: number,
    domainCache?: Map<string, { domainAnalysis: DomainAnalysisResult; trustedDomain: boolean }>
  ): Promise<LinkAnalysisResult> {
    const risks: string[] = [];
    let score = 0;
    let domainAnalysis: DomainAnalysisResult | undefined;
    let hostname: string | undefined;
    
    try {
      const url = new URL(link);
      hostname = url.hostname;
      
      // Namespace / DTD / schema links ≡ ignore entirely
      const isNamespaceURL = this.isNamespaceURL(link);
      if (isNamespaceURL) {
        return {
          link,
          isSuspicious: false,
          risks: [],
          score: 0
        };
      }
      
      // Get domain analysis from cache if available, otherwise fetch it
      let trustedDomain: boolean;
      
      if (domainCache && domainCache.has(hostname)) {
        const cached = domainCache.get(hostname)!;
        trustedDomain = cached.trustedDomain;
        domainAnalysis = cached.domainAnalysis;
      } else {
        // Fallback: analyze domain if not in cache (shouldn't happen in normal flow)
        trustedDomain = await isTrustedDomain(hostname, businessId);
        domainAnalysis = await analyzeDomain(hostname, businessId);
      }
      
      // Check for URL shorteners
      // Popular URL shorteners should be detected but receive minimal penalty
      if (isPopularUrlShortener(hostname)) {
        risks.push(`URL shortener detected: ${hostname}, small penalty`);
        score += 2; // Small penalty for popular URL shorteners
      }
      
      // Check for IP addresses in URLs (VERY suspicious)
      if (isIPAddress(hostname)) {
        risks.push(`IP address in URL: ${hostname}`);
        score += 35;
      }

      // Allow safe HTTP domains (legacy CDNs / W3C / ESPs)
      const isKnownSafeHttp =
        url.protocol === "http:" &&
        hostname !== undefined &&
        KNOWN_SAFE_HTTP_DOMAINS.some(d => hostname!.endsWith(d));

      if (url.protocol === "http:") {
        if (isKnownSafeHttp && this.isImageLink(link)) {
          // fine, legit email vendors do this
          risks.push(`HTTP image CDN (allowed): ${hostname}`);
          score += 0; // or +1 if you want slight suspicion
        }
        else if (this.isImageLink(link)) {
          risks.push(`HTTP image asset: ${hostname}`);
          score += 2; // tiny penalty — not ideal, but common
        }
        else if (this.isClickAction(link)) {
          risks.push(`Insecure HTTP link to action: ${link}`);
          score += 30; // serious — login/reset over HTTP is bad
        }
        else {
          risks.push(`Insecure HTTP link: ${link}`);
          score += 8; // general penalty
        }
      }

      // Use cached domain analysis
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
      const urlPatternRisks = this.checkUrlPatterns(url, trustedDomain);
      risks.push(...urlPatternRisks.risks);
      score += urlPatternRisks.score;
      
    } catch (error) {
      risks.push(`Malformed URL: ${link}`);
      score += 3;
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
  private checkUrlPatterns(url: URL, trustedDomain: boolean): { risks: string[]; score: number } {
    const risks: string[] = [];
    let score = 0;
    
    // Check for suspicious path patterns
    const suspiciousPaths = [
      /\/login/i, /\/signin/i, /\/account/i, /\/verify/i, /\/confirm/i,
      /\/update/i, /\/security/i, /\/password/i, /\/reset/i
    ];
    
    const pathScore = suspiciousPaths.some(p => p.test(url.pathname)) ? 5 : 0;

    if (pathScore > 0) {
      risks.push(`Suspicious URL path: ${url.pathname}`);
      score += pathScore;
    
      // Extra penalty ONLY if domain looks off
      if (!trustedDomain) {
        score += 10;
        risks.push("Suspicious login-like path on untrusted domain");
      }
    }
    
    // Check for suspicious query parameters
    const suspiciousParams = [
      'password', 'pwd', 'pass', 'token', 'key', 'secret', 'auth'
    ];
    
    
    const hasSuspiciousParams = suspiciousParams.some(param => 
      url.searchParams.has(param) || url.search.includes(`${param}=`)
    );

    if (hasSuspiciousParams) {
      risks.push(`Suspicious query parameters: ${url.search}`);

      // Mild base suspicion
      score += 3;

      // If domain is not recognized as legit, increase penalty
      if (!trustedDomain) {
        score += 12;
        risks.push(`Credential-like params on untrusted domain`);
      }
    }
    
    // Check for excessive subdomains (potential subdomain takeover)
    const subdomainCount = url.hostname.split('.').length - 2;

    if (subdomainCount > 3) {
      if (!trustedDomain) {
        risks.push(`Excessive subdomains: ${url.hostname}`);
        score += 8; // modest suspicion
      } 
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
