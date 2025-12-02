/**
 * Email Header Analyzer
 * Analyzes missing critical email headers for phishing detection
 * Trusts domains from monitored emails and built-in trusted domains
 * 
 * Headers Analyzed:
 * - From: Sender's email address and display name (essential for sender verification)
 * - Return-Path: Actual sending server's email address (shows real origin)
 * - Message-ID: Unique identifier for the email message (prevents duplicates)
 * - Received: Email routing path through mail servers (traceability)
 * - Reply-To: Where replies should be sent (spoofing detection when differs from From)
 * - User-Agent: Email client/software identifier (legitimacy indicator)
 * - X- headers: Custom headers (excessive amounts indicate spoofing)
 * 
 * Lookalike Detection:
 * - Typosquatting: Uses fast-levenshtein library for efficient string distance calculation
 * - Homoglyph Attacks: Uses confusables library for comprehensive Unicode homoglyph detection
 * - Suspicious Patterns: Detects incomplete domains (e.g., gmail.co instead of gmail.com)
 * - Brand Protection: Compares against 50+ known brand domains
 * 
 * Note: DKIM-Signature and Authentication-Results are analyzed by emailAuthDetector.ts
 */

import { query } from '../../../db/connection.js';
import { oauthLogger } from '../../../utils/logger.js';
import { analyzeDomain, extractDomain as extractDomainUtil, isTemporaryEmailDomain } from './domainAnalyzer.js';
import { getDomain } from 'tldts';

export interface HeaderAnalysis {
  missingHeaders: string[];
  risks: string[];
  score: number;
  isTrustedDomain: boolean;
}

export function getOrgDomain(domain: string): string {
  // handle multi-level TLDs (co.uk, com.au etc.)
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;
  
  const tld = parts.slice(-2).join('.');
  return tld;
}



/**
 * Header Analyzer Service Class
 */
export class HeaderAnalyzerService {
  private readonly builtInTrustedDomains: string[] = [
    // Internal systems (always safe)
    'localhost',
    '127.0.0.1',
  ];

  // Legitimate email service providers that businesses commonly use
  private readonly legitimateEmailServices: string[] = [
    // Transactional ESPs
    'amazonses.com', 'sendgrid.net', 'mailgun.org', 'mailgun.net', 'postmarkapp.com',
    'mandrillapp.com', 'sparkpostmail.com',
  
    // Marketing Platforms
    'mailchimp.com', 'constantcontact.com', 'aweber.com', 'getresponse.com',
    'mailerlite.com', 'convertkit.com', 'activecampaign.com',
  
    // CRM / Helpdesk
    'hubspot.com', 'salesforce.com', 'zendesk.com', 'freshdesk.com', 'intercom.io', 'helpscout.com',
  
    // Ecommerce / Automation
    'shopifyemail.com', 'shopify.com', 'stripe.com', 'squareup.com', 'klaviyo.com', 'sendinblue.com', 'brevo.com',
  
    // Major Email Providers
    'gmail.com', 'googlemail.com', 'outlook.com', 'office365.com', 'microsoft.com', 'protection.outlook.com',
  ];

  public headers: Record<string, string> = {};
  private risks: string[] = [];
  private missingHeaders: string[] = [];
  /**
   * Check if a domain is a legitimate email service provider
   */
  private isLegitimateEmailService(domain: string): boolean {
    if (!domain) return false;
  
    // Prevent DoS or overflow
    if (domain.length > 255) return false;
  
    const domainLower = domain.toLowerCase().trim();
  
    // Validate domain format
    if (!/^(?!-)(?!.*--)[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/.test(domainLower)) {
      return false;
    }
  
    try {
      // Extract registered/base domain (e.g. sub.mailchimp.com → mailchimp.com)
      const root = getDomain(domainLower);
  
      if (!root) return false;
  
      // Check if the base domain is in the whitelist
      return this.legitimateEmailServices.includes(root);
    } catch {
      return false;
    }
  }

  /**
   * Analyze email headers for missing critical headers
   * @param senderEmail - Sender email address
   * @param businessId - Business ID to check for custom trusted domains
   */
  async analyzeHeaders(
    senderEmail: string, 
    businessId?: number
  ): Promise<HeaderAnalysis> {
    this.missingHeaders = [];
    let score = 0;
    this.risks = [];
    // Check if sender domain is trusted
    const isTrustedDomain = await this.isTrustedDomain(senderEmail, businessId);
    score += this.checkForMissingHeaders(isTrustedDomain);
    score += this.checkForReceivedHeaders(isTrustedDomain);
    score += await this.checkForFromReturnPathMismatch(isTrustedDomain);
    score += await this.checkForReplyToFromMismatch(isTrustedDomain);

    // Check for suspicious header patterns
    if (!isTrustedDomain) {
      const senderDomain = extractDomainUtil(senderEmail);
      score += this.analyzeExcessiveHeaders();
      score += this.analyzeReceivedHeaders();
      score += this.analyzeUserAgent();
      score += await this.analyzeLookalikeDomains(senderEmail, senderDomain, businessId);
      if (senderDomain && isTemporaryEmailDomain(senderDomain)) {
        this.risks.push('Temporary or disposable email address');
        score += 25;
      }
    }

    return {
      missingHeaders: this.missingHeaders,
      risks: this.risks,
      score,
      isTrustedDomain
    };
  }



  private checkForMissingHeaders(isTrustedDomain: boolean): number {
    let score = 0;
    // Critical headers that should always be present
    const criticalHeaders = [
      // From: The sender's email address and display name
      // Essential for identifying who sent the email. Missing = cannot verify sender
      { name: 'from', displayName: 'From', score: isTrustedDomain ? 20 : 100 },
      
      // Return-Path: The actual sending server's email address (bounce address)
      // Shows the real origin server. Missing = cannot trace email source
      { name: 'return-path', displayName: 'Return-Path', score: isTrustedDomain ? 10 : 40 },
      
      // Message-ID: Unique identifier for the email message
      // Helps detect duplicate emails and verify message integrity
      { name: 'message-id', displayName: 'Message-ID', score: isTrustedDomain ? 5 : 30 },
    ];
    for (const header of criticalHeaders) {
      if (!this.headers[header.name]) {
        this.missingHeaders.push(header.displayName);
        score += header.score;
        
        if (isTrustedDomain) {
          this.risks.push(`${header.displayName} header missing - sender domain is trusted`);
        } else {
          this.risks.push(`CRITICAL: ${header.displayName} header missing - cannot verify email authenticity`);
        }
      }
    }
    return score;
  }

  // Check for Received headers (special case - multiple headers possible)
  // Received: Shows the path the email took through mail servers
  // Each mail server adds a Received header. Missing = cannot trace email routing
  // Multiple Received headers are normal (one per mail server hop)
    private checkForReceivedHeaders(isTrustedDomain: boolean): number {
    let score = 0;
    const receivedHeaders = Object.keys(this.headers).filter(key => 
      key.toLowerCase().startsWith('received')
    );
    
    if (receivedHeaders.length === 0) {
      this.missingHeaders.push('Received');
      const receivedScore = isTrustedDomain ? 15 : 70;
      score += receivedScore;
      
      if (isTrustedDomain) {
        this.risks.push('No Received headers - sender domain is trusted');
      } else {
        this.risks.push('CRITICAL: No Received headers - email routing cannot be traced');
      }
    }
    return score;
  }

  // Check for From vs Return-Path domain mismatch (high risk spoofing indicator)
  // From: Who the email appears to be from
  // Return-Path: Actual sending server's email address
  // Domain mismatch = email appears from one domain but sent from another (classic spoofing)
  // Check From vs Return-Path mismatch
  private async checkForFromReturnPathMismatch(isTrustedDomain: boolean): Promise<number> {
    let score = 0;
    const headersExist = this.headers['from'] && this.headers['return-path'];
    if (!headersExist) { return score; }

    const fromDomain = extractDomainUtil(this.headers['from']);
    const returnPathDomain = extractDomainUtil(this.headers['return-path']);
    if (!fromDomain || !returnPathDomain) { return score; }

    const fromOrgDomain = getOrgDomain(fromDomain);
    const returnPathOrgDomain = getOrgDomain(returnPathDomain);
    const domainsMatch = fromOrgDomain === returnPathOrgDomain;
    if (domainsMatch) { return score; }

    
    return await this.getMismatchScore(fromDomain, returnPathDomain, isTrustedDomain);
  }
  private async getMismatchScore(fromDomain: string, returnPathDomain: string, isTrustedDomain: boolean): Promise<number> {
    let score = 0;
    const isLegitESP = this.isLegitimateEmailService(returnPathDomain);
    const returnPathTrusted = await this.isTrustedDomain(returnPathDomain);
    
    if (isLegitESP) {
      this.risks.push(`From (${fromDomain}) != Return-Path (${returnPathDomain}) - sent via trusted mail service`);
      score += 3; // almost no risk
    }
    else if (returnPathTrusted && !isTrustedDomain) {
      // Return-Path is trusted but From isn't -> spoof attempt
      this.risks.push(`Return-Path (${returnPathDomain}) trusted but From (${fromDomain}) is not - likely spoof`);
      score += 35;
    }
    else if (isTrustedDomain) {
      // Spoof of a known org - but trusted domain, so lower penalty
      this.risks.push(`From domain (${fromDomain}) trusted but Return-Path (${returnPathDomain}) differs - possible brand spoof`);
      score += 20; // Reduced from 25 to 20 for trusted domains
    } 
    else {
      // Generic mismatch
      this.risks.push(`From (${fromDomain}) != Return-Path (${returnPathDomain}) - high spoofing risk`);
      score += 35;
    }
    return score;
  }

  private async checkForReplyToFromMismatch(isTrustedDomain: boolean): Promise<number> {
    let score = 0;
    // Check for Reply-To vs From mismatch (potential spoofing)
    // Reply-To: Where replies should be sent (can differ from From)
    // From: Who the email appears to be from
    // Mismatch can indicate spoofing - email appears from one person but replies go elsewhere
    const from = this.headers['from']?.toLowerCase() || '';
    const replyTo = this.headers['reply-to']?.toLowerCase() || '';
    if (!from || !replyTo) return 0;

    const fromDomain = extractDomainUtil(from);
    const replyDomain = extractDomainUtil(replyTo);
    if (!fromDomain || !replyDomain) { return score; }

    const fromOrg = getOrgDomain(fromDomain);
    const replyOrg = getOrgDomain(replyDomain);
      // Same org domain → lower risk (likely support/marketing alias)
    const isSameOrg = fromOrg === replyOrg;
    if (!isSameOrg) {
      score += isTrustedDomain ? 5 : 25;
      const message = isTrustedDomain ? 'Reply-To differs from From - sender domain is trusted' : `Reply-To domain (${replyOrg}) differs from From domain (${fromOrg}) - potential spoofing`;
      this.risks.push(message);
    }
    return score;
  }
  
  /**
   * Check if a sender domain is trusted (either built-in or from monitored emails)
   */
  private async isTrustedDomain(senderEmail: string, businessId?: number): Promise<boolean> {
    const senderDomain = senderEmail.split('@')[1]?.toLowerCase();
    if (!senderDomain) {
      return false;
    }

    // Check against built-in trusted domains
    const isBuiltInTrusted = this.builtInTrustedDomains.some(trusted => 
      senderDomain === trusted || senderDomain.endsWith('.' + trusted)
    );

    if (isBuiltInTrusted) {
      return true;
    }

    // Check if sender domain matches any monitored email domain for this business
    if (businessId) {
      try {
        const result = await query(
          `SELECT COUNT(*) as count 
           FROM monitored_emails 
           WHERE business_id = $1 
           AND LOWER(SUBSTRING(email_address FROM '@(.*)$')) = $2`,
          [businessId, senderDomain]
        );

        const count = Number.parseInt((result.rows[0] as { count: string }).count);
        return count > 0;
      } catch (error) {
        oauthLogger.error('Failed to check monitored email domains', {
          operation: 'check-monitored-domains',
          metadata: { businessId, senderDomain }
        }, error as Error);
      }
    }

    return false;
  }

  private analyzeUserAgent(): number {
    let score = 0;
    // Check for missing or suspicious User-Agent
    // User-Agent: Identifies the email client/software that sent the email
    // Missing = unusual for legitimate emails (most email clients include this)
    // But this check should be less strict - many legitimate emails don't have User-Agent
    // We'll only flag it if other suspicious indicators are present
    // (This check is kept but with reduced severity since User-Agent is often missing in legitimate emails)
    if (!this.headers['user-agent']) {
      // Check if this is from a legitimate email service (they often don't include User-Agent)
      const fromDomain = this.headers['from'] ? extractDomainUtil(this.headers['from']) : null;
      const returnPathDomain = this.headers['return-path'] ? extractDomainUtil(this.headers['return-path']) : null;
      const isFromLegitimateService = (fromDomain && this.isLegitimateEmailService(fromDomain)) || 
                                     (returnPathDomain && this.isLegitimateEmailService(returnPathDomain));
      
      if (isFromLegitimateService) {
        this.risks.push('User-Agent header missing - common for email services');
        score += 3; // Very low penalty for legitimate services
      } else {
        this.risks.push('User-Agent header missing - unusual for legitimate emails');
        score += 5; // Reduced from 15 to 5 - User-Agent is often missing in legitimate emails
      }
    }
    return score;
  }

  // Check for suspicious X- headers (potential spoofing indicators)
  // X- headers: Custom headers (non-standard, start with "X-")
  // Excessive X- headers can indicate spoofing attempts or malicious modifications
  // Note: Many legitimate email systems (especially enterprise/university) include multiple X- headers
  // So we'll use a higher threshold to reduce false positives
  private analyzeExcessiveHeaders(): number {
    let score = 0;
    const xHeaders = Object.keys(this.headers).filter(key => 
      key.toLowerCase().startsWith('x-')
    );

    // Enterprise fingerprints
    const enterpriseIndicators = [
      'x-microsoft-', 'x-ms-', 'x-google-', 'x-gm-', 
      'x-proofpoint', 'x-mimecast', 'x-amz-', 'x-ses-'
    ];
    const hasEnterpriseHeaders = Object.keys(this.headers).some(key =>
      enterpriseIndicators.some(ind => key.toLowerCase().startsWith(ind))
    );
    const baseThreshold = 10;
    const enterpriseBuffer = 8; 
    const threshold = hasEnterpriseHeaders ? baseThreshold + enterpriseBuffer : baseThreshold;
    if (xHeaders.length > threshold) {
      const excess = xHeaders.length - threshold;
      let penalty = 2;
      if (excess > 5) penalty = 5;
      if (excess > 15) penalty = 10;
    
      this.risks.push(`Excessive X- headers - potential spoofing attempt`);
      score += penalty;
    }
    return score;
  }
  // Check for suspicious Received header patterns
  // Received headers: Show email routing path (one per mail server)
  // Excessive Received headers (>10) can indicate email loops or spoofing attempts
  private analyzeReceivedHeaders(): number {
    let score = 0;
    const receivedHeaders = Object.keys(this.headers).filter(key => 
      key.toLowerCase().startsWith('received')
    );
    
    if (receivedHeaders.length > 18) {
      this.risks.push('Excessive Received headers - potential email loop or spoofing');
      score += 25;
    } else if (receivedHeaders.length > 12) {
      this.risks.push('Excessive Received headers - potential email loop or spoofing');
      score += 10;
    }
    return score;
  }

  /**
   * Analyze domains for lookalike attacks (typosquatting and homoglyphs)
   */
  private async analyzeLookalikeDomains(senderEmail: string, senderDomain: string | null, businessId?: number): Promise<number> {
    let score = 0;

    if (!senderDomain) {
      return 0;
    }

    // Check for lookalike attacks and domain age using shared domain analyzer
    const domainAnalysis = await analyzeDomain(senderDomain, businessId);
    if (!domainAnalysis.isSuspicious) {
      return 0;
    }

    for (const type of domainAnalysis.types) {
      switch (type) {
        case 'typosquatting':
          this.risks.push(`Typosquatting detected: "${senderDomain}" is similar to "${domainAnalysis.similarDomain}" (distance: ${domainAnalysis.distance})`);
          break;
        case 'homoglyph':
          this.risks.push(`Homoglyph attack detected: "${senderDomain}" contains visually similar characters to "${domainAnalysis.similarDomain}"`);
          break;
        case 'suspicious_pattern':
          this.risks.push(`Suspicious domain pattern: "${senderDomain}"`);
          break;
        case 'domain_age': {
            const ageText = domainAnalysis.domainAge?.ageInDays 
            ? `${domainAnalysis.domainAge.ageInDays} days old`
            : 'unknown age';
            this.risks.push(`Newly registered sender domain: "${senderDomain}" (${ageText}, risk: ${domainAnalysis.domainAge?.riskLevel})`);
            break;
          }
        }
      }
      score += domainAnalysis.riskScore;
      return score;
    }

  /**
   * Generate header-specific recommendations
   */
  generateHeaderRecommendations(analysis: HeaderAnalysis): string[] {
    const recommendations: string[] = [];

    if (analysis.missingHeaders.length > 0) {
      if (analysis.isTrustedDomain) {
        recommendations.push(`Missing headers (${analysis.missingHeaders.join(', ')}) - sender domain is trusted but headers should be present`);
      } else {
        recommendations.push(`CRITICAL: Missing headers (${analysis.missingHeaders.join(', ')}) - email authenticity cannot be verified`);
      }
    }

    // Check for From vs Return-Path domain mismatch
    const hasFromReturnPathMismatch = analysis.risks.some(risk => 
      (risk.includes('From (') && risk.includes('!= Return-Path (')) || 
      (risk.includes('From domain') && risk.includes('differs from Return-Path domain'))
    );
    
    if (hasFromReturnPathMismatch) {
      // Check if it's a legitimate email service
      const hasLegitimateService = analysis.risks.some(risk => 
        (risk.includes('From (') && risk.includes('!= Return-Path (') && risk.includes('sent via trusted mail service')) ||
        (risk.includes('From domain') && risk.includes('differs from Return-Path domain') && risk.includes('using legitimate email service'))
      );
      
      if (hasLegitimateService) {
        recommendations.push('From and Return-Path domains differ - this is normal when using legitimate email services like Amazon SES, SendGrid, etc.');
      } else {
        recommendations.push('CRITICAL: From and Return-Path domains differ - this is a strong indicator of email spoofing');
      }
    }

    if (analysis.risks.some(risk => 
      risk.includes('Reply-To differs from From') || 
      risk.includes('Reply-To domain') || 
      risk.includes('Reply-To mailbox')
    )) {
      recommendations.push('Reply-To header differs from From - verify sender identity through alternative channel');
    }

    if (analysis.risks.some(risk => risk.includes('Excessive X- headers'))) {
      recommendations.push('Excessive X- headers detected - email may be spoofed');
    }

    if (analysis.risks.some(risk => risk.includes('No Received headers'))) {
      recommendations.push('No Received headers - email routing cannot be traced, treat as suspicious');
    }

    if (analysis.risks.some(risk => risk.includes('Typosquatting detected'))) {
      recommendations.push('CRITICAL: Typosquatting detected - domain is very similar to a known brand, likely phishing attempt');
    }

    if (analysis.risks.some(risk => risk.includes('Homoglyph attack detected'))) {
      recommendations.push('CRITICAL: Homoglyph attack detected - domain uses visually similar characters to impersonate a brand');
    }

    return recommendations;
  }
}

// Export singleton instance
export const headerAnalyzerService = new HeaderAnalyzerService();
