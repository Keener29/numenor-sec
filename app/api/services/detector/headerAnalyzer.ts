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
 * - Brand Protection: Compares against 50+ known brand domains
 * 
 * Note: DKIM-Signature and Authentication-Results are analyzed by emailAuthDetector.ts
 */

import { query } from '../../../db/connection.js';
import { oauthLogger } from '../logger.js';
import { get as levenshteinDistance } from 'fast-levenshtein';
import * as confusables from 'confusables';

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

  // Known brand domains for lookalike detection
  private knownBrandDomains: string[] = [
    // Major tech companies
    'microsoft.com', 'google.com', 'apple.com', 'amazon.com', 'facebook.com',
    'twitter.com', 'linkedin.com', 'instagram.com', 'youtube.com', 'netflix.com',
    
    // Financial services
    'paypal.com', 'visa.com', 'mastercard.com', 'americanexpress.com', 'chase.com',
    'bankofamerica.com', 'wellsfargo.com', 'citibank.com', 'jpmorgan.com',
    
    // E-commerce
    'ebay.com', 'shopify.com', 'etsy.com', 'walmart.com', 'target.com',
    
    // Email providers
    'gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com', 'icloud.com',
    
    // Cloud services
    'aws.amazon.com', 'azure.microsoft.com', 'cloud.google.com', 'dropbox.com',
    
    // Social media
    'tiktok.com', 'snapchat.com', 'pinterest.com', 'reddit.com', 'discord.com',
    
    // Government/Institutions
    'irs.gov', 'ssa.gov', 'usps.com', 'fedex.com', 'ups.com',
    
    // Crypto/Finance
    'coinbase.com', 'binance.com', 'kraken.com', 'robinhood.com', 'stripe.com'
  ];


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
    if (headers['from'] && headers['return-path']) {
      const fromDomain = this.extractDomain(headers['from']);
      const returnPathDomain = this.extractDomain(headers['return-path']);
      
      if (fromDomain && returnPathDomain && fromDomain !== returnPathDomain) {
        const domainMismatchScore = isTrustedDomain ? 15 : 50; // High risk for external domains
        score += domainMismatchScore;
        
        if (isTrustedDomain) {
          risks.push(`From domain (${fromDomain}) differs from Return-Path domain (${returnPathDomain}) - sender domain is trusted`);
        } else {
          risks.push(`CRITICAL: From domain (${fromDomain}) differs from Return-Path domain (${returnPathDomain}) - high spoofing risk`);
        }
      }
    }

    // Check for Reply-To vs From mismatch (potential spoofing)
    // Reply-To: Where replies should be sent (can differ from From)
    // From: Who the email appears to be from
    // Mismatch can indicate spoofing - email appears from one person but replies go elsewhere
    if (headers['reply-to'] && headers['from'] && 
        headers['reply-to'].toLowerCase() !== headers['from'].toLowerCase()) {
      const replyToScore = isTrustedDomain ? 5 : 25;
      score += replyToScore;
      
      if (isTrustedDomain) {
        risks.push('Reply-To differs from From - sender domain is trusted');
      } else {
        risks.push('Reply-To differs from From - potential spoofing indicator');
      }
    }

    // Check for suspicious header patterns
    const suspiciousPatterns = this.analyzeSuspiciousHeaders(headers);
    risks.push(...suspiciousPatterns.risks);
    score += suspiciousPatterns.score;

    // Check for lookalike domains (typosquatting and homoglyph attacks)
    const lookalikeAnalysis = this.analyzeLookalikeDomains(senderEmail);
    risks.push(...lookalikeAnalysis.risks);
    score += lookalikeAnalysis.score;

    return {
      missingHeaders,
      risks,
      score,
      isTrustedDomain
    };
  }

  /**
   * Extract domain from email address or email header
   * Handles formats like: "user@domain.com", "Display Name <user@domain.com>", "<user@domain.com>"
   */
  private extractDomain(emailString: string): string | null {
    if (!emailString) return null;
    
    // Handle format: "Display Name <user@domain.com>"
    const angleBracketMatch = emailString.match(/<([^>]+)>/);
    if (angleBracketMatch) {
      const email = angleBracketMatch[1];
      const domain = email.split('@')[1]?.toLowerCase();
      return domain || null;
    }
    
    // Handle format: "user@domain.com" or just "domain.com"
    const atIndex = emailString.indexOf('@');
    if (atIndex !== -1) {
      const domain = emailString.substring(atIndex + 1).toLowerCase();
      return domain || null;
    }
    
    return null;
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

    // Check for suspicious From header patterns
    // From header format: "Display Name <email@domain.com>" or just "email@domain.com"
    if (headers['from']) {
      const fromHeader = headers['from'].toLowerCase();
      
      // Check for display name spoofing
      // Format: "Display Name <email@domain.com>"
      if (fromHeader.includes('<') && fromHeader.includes('>')) {
        const displayName = fromHeader.split('<')[0].trim();
        const emailPart = fromHeader.split('<')[1].split('>')[0].trim();
        
        // Check if display name contains suspicious patterns
        // "noreply" in display name can indicate automated/spoofed emails
        if (displayName.includes('noreply') || displayName.includes('no-reply')) {
          risks.push('Suspicious display name in From header');
          score += 10;
        }
      }

      // Check for suspicious email patterns
      // "noreply@" addresses are often used by automated systems and can be spoofed
      if (fromHeader.includes('noreply@') || fromHeader.includes('no-reply@')) {
        risks.push('No-reply email address - verify legitimacy');
        score += 5;
      }
    }

    // Check for missing or suspicious User-Agent
    // User-Agent: Identifies the email client/software that sent the email
    // Missing = unusual for legitimate emails (most email clients include this)
    if (!headers['user-agent']) {
      risks.push('User-Agent header missing - unusual for legitimate emails');
      score += 15;
    }

    // Check for suspicious X- headers (potential spoofing indicators)
    // X- headers: Custom headers (non-standard, start with "X-")
    // Excessive X- headers can indicate spoofing attempts or malicious modifications
    const xHeaders = Object.keys(headers).filter(key => 
      key.toLowerCase().startsWith('x-')
    );
    
    if (xHeaders.length > 5) {
      risks.push('Excessive X- headers - potential spoofing attempt');
      score += 20;
    }

    // Check for suspicious Received header patterns
    // Received headers: Show email routing path (one per mail server)
    // Excessive Received headers (>10) can indicate email loops or spoofing attempts
    const receivedHeaders = Object.keys(headers).filter(key => 
      key.toLowerCase().startsWith('received')
    );
    
    if (receivedHeaders.length > 10) {
      risks.push('Excessive Received headers - potential email loop or spoofing');
      score += 25;
    }

    return { risks, score };
  }

  /**
   * Analyze domains for lookalike attacks (typosquatting and homoglyphs)
   */
  private analyzeLookalikeDomains(senderEmail: string): { risks: string[]; score: number } {
    const risks: string[] = [];
    let score = 0;

    const senderDomain = this.extractDomain(senderEmail);
    if (!senderDomain) {
      return { risks, score };
    }

    // Check for typosquatting using Levenshtein distance
    const typosquattingResult = this.detectTyposquatting(senderDomain);
    if (typosquattingResult.isSuspicious && typosquattingResult.distance !== undefined) {
      risks.push(`Typosquatting detected: "${senderDomain}" is similar to "${typosquattingResult.similarDomain}" (distance: ${typosquattingResult.distance})`);
      score += typosquattingResult.distance <= 1 ? 40 : 25; // Higher score for very close matches
    }

    // Check for homoglyph attacks
    const homoglyphResult = this.detectHomoglyphs(senderDomain);
    if (homoglyphResult.isSuspicious) {
      risks.push(`Homoglyph attack detected: "${senderDomain}" contains visually similar characters to "${homoglyphResult.similarDomain}"`);
      score += 35; // High score for homoglyph attacks
    }

    return { risks, score };
  }

  /**
   * Detect typosquatting using Levenshtein distance (using fast-levenshtein library)
   */
  private detectTyposquatting(domain: string): { isSuspicious: boolean; similarDomain?: string; distance?: number } {
    const domainWithoutTld = domain.split('.')[0]; // Remove .com, .org, etc.
    
    for (const brandDomain of this.knownBrandDomains) {
      const brandWithoutTld = brandDomain.split('.')[0];
      const distance = levenshteinDistance(domainWithoutTld.toLowerCase(), brandWithoutTld.toLowerCase());
      
      // Consider suspicious if distance is 1-2 and domains are reasonably similar length
      if (distance <= 2 && Math.abs(domainWithoutTld.length - brandWithoutTld.length) <= 2) {
        return {
          isSuspicious: true,
          similarDomain: brandDomain,
          distance
        };
      }
    }

    return { isSuspicious: false };
  }

  /**
   * Detect homoglyph attacks using confusables library + number-to-letter substitutions
   */
  private detectHomoglyphs(domain: string): { isSuspicious: boolean; similarDomain?: string } {
    const domainWithoutTld = domain.split('.')[0].toLowerCase();
    
    for (const brandDomain of this.knownBrandDomains) {
      const brandWithoutTld = brandDomain.split('.')[0].toLowerCase();
      
      // Check if domains are same length and contain homoglyphs
      if (domainWithoutTld.length === brandWithoutTld.length) {
        // Use confusables library for Unicode homoglyphs (Cyrillic, Greek, etc.)
        const normalizedDomain = confusables.default(domainWithoutTld);
        const normalizedBrand = confusables.default(brandWithoutTld);
        
        if (normalizedDomain === normalizedBrand && domainWithoutTld !== brandWithoutTld) {
          return {
            isSuspicious: true,
            similarDomain: brandDomain
          };
        }
        
        // Also check for number-to-letter substitutions (confusables doesn't handle these)
        const numberSubstitutedDomain = this.normalizeNumberSubstitutions(domainWithoutTld);
        const numberSubstitutedBrand = this.normalizeNumberSubstitutions(brandWithoutTld);
        
        if (numberSubstitutedDomain === numberSubstitutedBrand && domainWithoutTld !== brandWithoutTld) {
          return {
            isSuspicious: true,
            similarDomain: brandDomain
          };
        }
      }
    }

    return { isSuspicious: false };
  }

  /**
   * Normalize number-to-letter substitutions (1->l, 0->o, etc.)
   */
  private normalizeNumberSubstitutions(text: string): string {
    return text
      .replace(/1/g, 'l')  // 1 -> l
      .replace(/0/g, 'o')  // 0 -> o
      .replace(/3/g, 'e')  // 3 -> e
      .replace(/4/g, 'a')  // 4 -> a
      .replace(/5/g, 's')  // 5 -> s
      .replace(/7/g, 't')  // 7 -> t
      .replace(/8/g, 'b')  // 8 -> b
      .replace(/9/g, 'g'); // 9 -> g
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

    if (analysis.risks.some(risk => risk.includes('From domain') && risk.includes('differs from Return-Path domain'))) {
      recommendations.push('CRITICAL: From and Return-Path domains differ - this is a strong indicator of email spoofing');
    }

    if (analysis.risks.some(risk => risk.includes('Reply-To differs from From'))) {
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
