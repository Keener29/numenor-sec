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
import { oauthLogger } from '../logger.js';
import { analyzeDomain, extractDomain as extractDomainUtil, isTemporaryEmailDomain } from './domainAnalyzer.js';
import { analyzeSenderDomainAge } from './domainAgeAnalyzer.js';

export interface HeaderAnalysis {
  missingHeaders: string[];
  risks: string[];
  score: number;
  isTrustedDomain: boolean;
}


/**
 * Header Analyzer Service Class
 */
export class HeaderAnalyzerService {
  private builtInTrustedDomains: string[] = [
    // Internal systems (always safe)
    'localhost',
    '127.0.0.1',
  ];

  // Legitimate email service providers that businesses commonly use
  private legitimateEmailServices: string[] = [
    'amazonses.com',
    'sendgrid.net',
    'mailgun.org',
    'mailgun.net',
    'postmarkapp.com',
    'mandrillapp.com',
    'sparkpostmail.com',
    'mailchimp.com',
    'constantcontact.com',
    'aweber.com',
    'getresponse.com',
    'mailerlite.com',
    'convertkit.com',
    'activecampaign.com',
    'hubspot.com',
    'salesforce.com',
    'zendesk.com',
    'freshdesk.com',
    'intercom.io',
    'helpscout.com'
  ];

  /**
   * Check if a domain is a legitimate email service provider
   */
  private isLegitimateEmailService(domain: string): boolean {
    if (!domain) return false;
    
    // Limit input length to prevent DoS attacks
    if (domain.length > 255) return false;
    
    const domainLower = domain.toLowerCase().trim();
    
    // Basic domain format validation
    if (!/^[a-zA-Z0-9.-]+$/.test(domainLower)) return false;
    
    // Check exact matches
    if (this.legitimateEmailServices.includes(domainLower)) {
      return true;
    }
    
    // Check for legitimate subdomains of email services
    // Prevent spoofing like evil-amazonses.com or fake.mailchimp.com.evil.com
    return this.legitimateEmailServices.some(service => {
      if (domainLower.endsWith('.' + service)) {
        const subdomain = domainLower.slice(0, -(service.length + 1));
        // Ensure subdomain doesn't contain dots (prevents nested subdomain attacks)
        // Allow legitimate subdomains like us-east-2.amazonses.com
        return !subdomain.includes('.');
      }
      return false;
    });
  }

  /**
   * Analyze email headers for missing critical headers
   * @param headers - Email headers to analyze
   * @param senderEmail - Sender email address
   * @param businessId - Business ID to check for custom trusted domains
   */
  async analyzeHeaders(
    headers: Record<string, string>, 
    senderEmail: string, 
    businessId?: number
  ): Promise<HeaderAnalysis> {
    const missingHeaders: string[] = [];
    const risks: string[] = [];
    let score = 0;

    // Check if sender domain is trusted
    const isTrustedDomain = await this.isTrustedDomain(senderEmail, businessId);

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

    // Check for missing critical headers
    for (const header of criticalHeaders) {
      if (!headers[header.name]) {
        missingHeaders.push(header.displayName);
        score += header.score;
        
        if (isTrustedDomain) {
          risks.push(`${header.displayName} header missing - sender domain is trusted`);
        } else {
          risks.push(`CRITICAL: ${header.displayName} header missing - cannot verify email authenticity`);
        }
      }
    }

    // Check for Received headers (special case - multiple headers possible)
    // Received: Shows the path the email took through mail servers
    // Each mail server adds a Received header. Missing = cannot trace email routing
    // Multiple Received headers are normal (one per mail server hop)
    const receivedHeaders = Object.keys(headers).filter(key => 
      key.toLowerCase().startsWith('received')
    );
    
    if (receivedHeaders.length === 0) {
      missingHeaders.push('Received');
      const receivedScore = isTrustedDomain ? 15 : 70;
      score += receivedScore;
      
      if (isTrustedDomain) {
        risks.push('No Received headers - sender domain is trusted');
      } else {
        risks.push('CRITICAL: No Received headers - email routing cannot be traced');
      }
    }

    // Check for From vs Return-Path domain mismatch (high risk spoofing indicator)
    // From: Who the email appears to be from
    // Return-Path: Actual sending server's email address
    // Domain mismatch = email appears from one domain but sent from another (classic spoofing)
    // Check From vs Return-Path mismatch
  if (headers['from'] && headers['return-path']) {
    const fromDomain = extractDomainUtil(headers['from']);
    const returnPathDomain = extractDomainUtil(headers['return-path']);
    
    if (fromDomain && returnPathDomain && fromDomain !== returnPathDomain) {
      const isLegitESP = this.isLegitimateEmailService(returnPathDomain);
      const returnPathTrusted = await this.isTrustedDomain(returnPathDomain);
      
      if (isLegitESP) {
        risks.push(`From (${fromDomain}) != Return-Path (${returnPathDomain}) - sent via trusted mail service`);
        score += 3; // almost no risk
      }
      else if (returnPathTrusted && !isTrustedDomain) {
        // Return-Path is trusted but From isn't -> spoof attempt
        risks.push(`Return-Path (${returnPathDomain}) trusted but From (${fromDomain}) is not - likely spoof`);
        score += 35;
      }
      else if (isTrustedDomain) {
        // Spoof of a known org - but trusted domain, so lower penalty
        risks.push(`From domain (${fromDomain}) trusted but Return-Path (${returnPathDomain}) differs - possible brand spoof`);
        score += 20; // Reduced from 25 to 20 for trusted domains
      } 
      else {
        // Generic mismatch
        risks.push(`From (${fromDomain}) != Return-Path (${returnPathDomain}) - high spoofing risk`);
        score += 35;
      }
    }
}

    // Check for Reply-To vs From mismatch (potential spoofing)
    // Reply-To: Where replies should be sent (can differ from From)
    // From: Who the email appears to be from
    // Mismatch can indicate spoofing - email appears from one person but replies go elsewhere
    const from = headers['from']?.toLowerCase() || '';
    const replyTo = headers['reply-to']?.toLowerCase() || '';

    if (replyTo && from && replyTo !== from) {
      const fromDomain = extractDomainUtil(from);
      const replyDomain = extractDomainUtil(replyTo);

      let mismatchScore = 0;
      let reason = '';

      if (fromDomain !== replyDomain) {
        // Completely different domain = high risk
        mismatchScore = isTrustedDomain ? 5 : 25;
        reason = `Reply-To domain (${replyDomain}) differs from From domain (${fromDomain})`;
      } else {
        // Same domain, different mailbox => could be legit marketing/support flow
        mismatchScore = isTrustedDomain ? 0 : 5;
        reason = `Reply-To mailbox differs from From mailbox within same domain`;
      }

      if (mismatchScore > 0) {
        score += mismatchScore;
        if (isTrustedDomain) {
          risks.push('Reply-To differs from From - sender domain is trusted');
        } else {
          risks.push(`${reason} - potential spoofing`);
        }
      }
    }

    // Check for suspicious header patterns
    const suspiciousPatterns = this.analyzeSuspiciousHeaders(headers);
    risks.push(...suspiciousPatterns.risks);
    score += suspiciousPatterns.score;

    if (!isTrustedDomain) {
      const lookalikeAnalysis = await this.analyzeLookalikeDomains(senderEmail, businessId);
      risks.push(...lookalikeAnalysis.risks);
      score += lookalikeAnalysis.score;
    }

    if (!isTrustedDomain) {
      const senderDomain = extractDomainUtil(senderEmail);
      if (senderDomain && isTemporaryEmailDomain(senderDomain)) {
        risks.push('Temporary or disposable email address');
        score += 25;
      }
    }

    return {
      missingHeaders,
      risks,
      score,
      isTrustedDomain
    };
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

        const count = parseInt((result.rows[0] as { count: string }).count);
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

  /**
   * Analyze headers for suspicious patterns
   */
  private analyzeSuspiciousHeaders(headers: Record<string, string>): { risks: string[]; score: number } {
    const risks: string[] = [];
    let score = 0;

  

    // Check for missing or suspicious User-Agent
    // User-Agent: Identifies the email client/software that sent the email
    // Missing = unusual for legitimate emails (most email clients include this)
    // But this check should be less strict - many legitimate emails don't have User-Agent
    // We'll only flag it if other suspicious indicators are present
    // (This check is kept but with reduced severity since User-Agent is often missing in legitimate emails)
    if (!headers['user-agent']) {
      // Check if this is from a legitimate email service (they often don't include User-Agent)
      const fromDomain = headers['from'] ? extractDomainUtil(headers['from']) : null;
      const returnPathDomain = headers['return-path'] ? extractDomainUtil(headers['return-path']) : null;
      const isFromLegitimateService = (fromDomain && this.isLegitimateEmailService(fromDomain)) || 
                                     (returnPathDomain && this.isLegitimateEmailService(returnPathDomain));
      
      if (isFromLegitimateService) {
        risks.push('User-Agent header missing - common for email services');
        score += 3; // Very low penalty for legitimate services
      } else {
        risks.push('User-Agent header missing - unusual for legitimate emails');
        score += 10; // Reduced from 15 to 10 - User-Agent is often missing in legitimate emails
      }
    }

    // Check for suspicious X- headers (potential spoofing indicators)
    // X- headers: Custom headers (non-standard, start with "X-")
    // Excessive X- headers can indicate spoofing attempts or malicious modifications
    // Note: Many legitimate email systems (especially enterprise/university) include multiple X- headers
    // So we'll use a higher threshold to reduce false positives
    const xHeaders = Object.keys(headers).filter(key => 
      key.toLowerCase().startsWith('x-')
    );

    // Enterprise fingerprints
    const enterpriseIndicators = [
      'x-microsoft-', 'x-ms-', 'x-google-', 'x-gm-', 
      'x-proofpoint', 'x-mimecast', 'x-amz-', 'x-ses-'
    ];
    const hasEnterpriseHeaders = Object.keys(headers).some(key =>
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
    
      risks.push(`Excessive X- headers - potential spoofing attempt`);
      score += penalty;
    }
    
    // Check for suspicious Received header patterns
    // Received headers: Show email routing path (one per mail server)
    // Excessive Received headers (>10) can indicate email loops or spoofing attempts
    const receivedHeaders = Object.keys(headers).filter(key => 
      key.toLowerCase().startsWith('received')
    );
    
    if (receivedHeaders.length > 18) {
      risks.push('Excessive Received headers - potential email loop or spoofing');
      score += 25;
    } else if (receivedHeaders.length > 12) {
      risks.push('Excessive Received headers - potential email loop or spoofing');
      score += 10;
    }

    return { risks, score };
  }

  /**
   * Analyze domains for lookalike attacks (typosquatting and homoglyphs)
   */
  private async analyzeLookalikeDomains(senderEmail: string, businessId?: number): Promise<{ risks: string[]; score: number }> {
    const risks: string[] = [];
    let score = 0;

    const senderDomain = extractDomainUtil(senderEmail);
    if (!senderDomain) {
      return { risks, score };
    }

    // Check for lookalike attacks and domain age using shared domain analyzer
    const domainAnalysis = await analyzeDomain(senderDomain, businessId);
    if (domainAnalysis.isSuspicious) {
      switch (domainAnalysis.type) {
        case 'typosquatting':
          risks.push(`Typosquatting detected: "${senderDomain}" is similar to "${domainAnalysis.similarDomain}" (distance: ${domainAnalysis.distance})`);
          break;
        case 'homoglyph':
          risks.push(`Homoglyph attack detected: "${senderDomain}" contains visually similar characters to "${domainAnalysis.similarDomain}"`);
          break;
        case 'suspicious_pattern':
          risks.push(`Suspicious domain pattern: "${senderDomain}"`);
          break;
        case 'domain_age':
          if (domainAnalysis.domainAge) {
            const ageText = domainAnalysis.domainAge.ageInDays 
              ? `${domainAnalysis.domainAge.ageInDays} days old`
              : 'unknown age';
            risks.push(`Newly registered sender domain: "${senderDomain}" (${ageText}, risk: ${domainAnalysis.domainAge.riskLevel})`);
          }
          break;
      }
      score += domainAnalysis.riskScore;
    }

    return { risks, score };
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
