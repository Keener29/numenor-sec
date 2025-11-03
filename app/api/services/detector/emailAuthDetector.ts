/**
 * Email Authentication Service
 * Handles SPF, DKIM, and DMARC authentication analysis from email headers
 */

import { query } from '../../../db/connection.js';

// Authentication result types
export type SPFResult = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror';
export type DKIMResult = 'pass' | 'fail' | 'none' | 'temperror' | 'permerror';
export type DMARCResult = 'pass' | 'fail' | 'none' | 'temperror' | 'permerror';
export type OverallAuthResult = 'pass' | 'fail' | 'partial' | 'none';

export interface AuthenticationResults {
  spf: SPFResult;
  dkim: DKIMResult;
  dmarc: DMARCResult;
  overall: OverallAuthResult;
}

// Valid result sets for efficient lookup
const SPF_RESULTS = new Set(['pass', 'fail', 'softfail', 'neutral', 'none', 'temperror', 'permerror'] as const);
const DKIM_RESULTS = new Set(['pass', 'fail', 'none', 'temperror', 'permerror'] as const);
const DMARC_RESULTS = new Set(['pass', 'fail', 'none', 'temperror', 'permerror'] as const);

// Type guard functions for validation
const isValidSPFResult = (value: string): value is SPFResult => {
  return SPF_RESULTS.has(value as SPFResult);
};

const isValidDKIMResult = (value: string): value is DKIMResult => {
  return DKIM_RESULTS.has(value as DKIMResult);
};

const isValidDMARCResult = (value: string): value is DMARCResult => {
  return DMARC_RESULTS.has(value as DMARCResult);
};

/**
 * Email Authentication Service Class
 */
export class EmailAuthenticationService {
  /**
   * Analyze email authentication headers (SPF, DKIM, DMARC)
   */
  analyzeEmailAuthentication(headers: Record<string, string>): AuthenticationResults {
    const spf = this.analyzeSPF(headers);
    const dkim = this.analyzeDKIM(headers);
    const dmarc = this.analyzeDMARC(headers);
    
    // Determine overall authentication status
    let overall: OverallAuthResult = 'none';
    if (spf === 'pass' && dkim === 'pass' && dmarc === 'pass') {
      overall = 'pass';
    } else if (spf === 'fail' && dkim === 'fail' && dmarc === 'fail') {
      overall = 'fail'; // Only if ALL authentication failed
    } else if (spf === 'pass' || dkim === 'pass' || dmarc === 'pass') {
      overall = 'partial';
    }

    return { spf, dkim, dmarc, overall };
  }

  /**
   * Analyze SPF (Sender Policy Framework) authentication
   */
  private analyzeSPF(headers: Record<string, string>): SPFResult {
    // Check for SPF results in Authentication-Results header
    const authResults = headers['Authentication-Results'] ?? headers['authentication-results'];
    if (authResults) {
      const normalized = this.normalizeHeaderValue(authResults);
      const spfMatch = normalized.match(/spf=([a-z]+)/i);
      if (spfMatch) {
        const result = spfMatch[1].toLowerCase();
        if (isValidSPFResult(result)) {
          return result;
        }
      }
    }

    // Check for Received-SPF header
    const receivedSPF = headers['received-spf'];
    if (receivedSPF) {
      const normalized = this.normalizeHeaderValue(receivedSPF);
      const spfMatch = normalized.match(/^([a-z]+)\s*\(/i);
      if (spfMatch) {
        const result = spfMatch[1].toLowerCase();
        if (isValidSPFResult(result)) {
          return result;
        }
      }
    }

    return 'none';
  }

  /**
   * Normalize header value by removing newlines and extra whitespace
   * Email headers can be folded across multiple lines with whitespace
   */
  private normalizeHeaderValue(headerValue: string): string {
    // Replace newlines and carriage returns with spaces, then normalize multiple spaces to single space
    return headerValue.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Analyze DKIM (DomainKeys Identified Mail) authentication
   */
  private analyzeDKIM(headers: Record<string, string>): DKIMResult {
    const authResults = headers['Authentication-Results'] ?? headers['authentication-results'];
    if (authResults) {
      const normalized = this.normalizeHeaderValue(authResults);
      const dkimMatch = normalized.match(/dkim=([a-z]+)/i);
      if (dkimMatch) {
        const result = dkimMatch[1].toLowerCase();
        if (isValidDKIMResult(result)) {
          if (result === 'pass') {
            return 'pass';
          }
        }
      }
    }

    // Check for DKIM results in ARC-Authentication-Results header
    // ARC (Authenticated Received Chain) preserves authentication results across intermediaries
    const arcAuthResults = headers['ARC-Authentication-Results'] ?? headers['arc-authentication-results'];
    if (arcAuthResults) {
      const dkimMatch = arcAuthResults.match(/dkim=([a-z]+)/i);
      if (dkimMatch) {
        const result = dkimMatch[1].toLowerCase();
        if (isValidDKIMResult(result)) {
          return result;
        }
      }
    }

    // Check for DKIM-Signature header presence
    const dkimSignature = headers['dkim-signature'];
    if (dkimSignature) {
      // If DKIM signature exists but no result in Authentication-Results or ARC-Authentication-Results,
      // this likely means the signature verification failed
      return 'fail';
    }

    // No DKIM signature found - no authentication attempted
    return 'none';
  }

  /**
   * Analyze DMARC (Domain-based Message Authentication) authentication
   */
  private analyzeDMARC(headers: Record<string, string>): DMARCResult {
    const results: DMARCResult[] = [];
    const authResults = headers['Authentication-Results'] ?? headers['authentication-results'];
    if (authResults) {
      const normalized = this.normalizeHeaderValue(authResults);
      const dmarcMatch = normalized.match(/dmarc=([a-z]+)/i);
      if (dmarcMatch) {
        const result = dmarcMatch[1].toLowerCase();
        if (isValidDMARCResult(result)) {
          if (result === 'pass') {
            return 'pass';
          }
        }
      }
    }
    const arcAuthResults = headers['ARC-Authentication-Results'] ?? headers['arc-authentication-results'];
    if (arcAuthResults) {
      const dmarcMatch = arcAuthResults.match(/dmarc=([a-z]+)/i);
      if (dmarcMatch) {
        const result = dmarcMatch[1].toLowerCase();
        if (isValidDMARCResult(result)) {
          return result;
        }
      }
    }

    return 'none';
  }

  /**
   * Get risk score based on authentication results
   * @param authResults - Authentication analysis results
   * @param isAllowListed - Whether the sender domain is in the allow list (monitored emails)
   */
  getAuthenticationRiskScore(authResults: AuthenticationResults, isAllowListed: boolean = false): { risks: string[]; score: number } {
    const risks: string[] = [];
    let score = 0;

    // SPF analysis
    if (authResults.spf === 'fail') {
      risks.push('SPF authentication failed');
      score += isAllowListed ? 15 : 50; // Adjusted: 15-20 for allow-listed, 50 for normal
    } else if (authResults.spf === 'softfail') {
      risks.push('SPF authentication soft fail');
      score += isAllowListed ? 10 : 40; // Adjusted: reduced for allow-listed
    } else if (authResults.spf === 'none') {
      risks.push('No SPF authentication');
      score += isAllowListed ? 3 : 25; // Adjusted: 0-5 for allow-listed, 25 for normal
    }

    // DKIM analysis
    if (authResults.dkim === 'fail') {
      risks.push('DKIM authentication failed');
      score += isAllowListed ? 15 : 40; // Adjusted: 15-20 for allow-listed, 40 for normal
    } else if (authResults.dkim === 'none') {
      risks.push('No DKIM authentication');
      score += isAllowListed ? 3 : 20; // Adjusted: 0-5 for allow-listed, 20 for normal
    }

    // DMARC analysis
    if (authResults.dmarc === 'fail') {
      risks.push('DMARC authentication failed');
      score += isAllowListed ? 12 : 35; // Adjusted: 10-15 for allow-listed, 35 for normal
    } else if (authResults.dmarc === 'none') {
      risks.push('No DMARC authentication');
      score += isAllowListed ? 0 : 20; // Adjusted: 0 for allow-listed, 20 for normal
    }

    // Critical combination: Missing SPF + Missing DKIM = High phishing risk
    if (authResults.spf === 'none' && authResults.dkim === 'none') {
      if (isAllowListed) {
        risks.push('Both SPF and DKIM authentication missing - sender domain is allow-listed');
        score += 2; // Reduced penalty for allow-listed domains
      } else {
        risks.push('CRITICAL: Both SPF and DKIM authentication missing - high phishing risk');
        score += 40; // Combination penalty for non-allow-listed domains
      }
    }

    // Overall assessment
    if (authResults.overall === 'fail') {
      if (isAllowListed) {
        risks.push('Email authentication failed - sender domain is allow-listed');
        score += 20; // Reduced penalty for allow-listed domains
      } else {
        risks.push('Email authentication completely failed');
        score += 100; // Full penalty for non-allow-listed domains
      }
    } else if (authResults.overall === 'partial') {
      risks.push('Partial email authentication');
      score += isAllowListed ? 3 : 10; // Reduced for allow-listed
    } else if (authResults.overall === 'none') {
      if (isAllowListed) {
        risks.push('No email authentication - sender domain is allow-listed');
        score += 5; // Minimal penalty for allow-listed domains
      } else {
        risks.push('CRITICAL: No email authentication at all');
        score += 100; // Full penalty for non-allow-listed domains
      }
    }

    return { risks, score };
  }

  /**
   * Generate authentication-specific recommendations
   */
  generateAuthenticationRecommendations(risks: string[]): string[] {
    const recommendations: string[] = [];

    // Authentication-specific recommendations
    if (risks.some(risk => risk.includes('SPF'))) {
      recommendations.push('SPF authentication issue detected - verify sender domain legitimacy');
    }
    if (risks.some(risk => risk.includes('DKIM'))) {
      recommendations.push('DKIM authentication issue detected - email may be spoofed');
    }
    if (risks.some(risk => risk.includes('DMARC'))) {
      recommendations.push('DMARC authentication issue detected - high risk of email spoofing');
    }
    if (risks.some(risk => risk.includes('authentication completely failed'))) {
      recommendations.push('CRITICAL: All email authentication failed - do not trust this email');
    }
    if (risks.some(risk => risk.includes('Both SPF and DKIM authentication missing'))) {
      recommendations.push('CRITICAL: No SPF or DKIM authentication - this email is highly suspicious and likely phishing');
    }

    return recommendations;
  }

  /**
   * Check if a sender domain is in the monitored emails for a business (allow-listed)
   */
  async isDomainAllowListed(businessId: number, senderEmail: string): Promise<boolean> {
    try {
      const senderDomain = senderEmail.split('@')[1]?.toLowerCase();
      if (!senderDomain) {
        return false;
      }

      // Check if any monitored email for this business has the same domain
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
      // If there's an error checking the database, default to not allow-listed
      return false;
    }
  }
}

// Export singleton instance
export const emailAuthenticationService = new EmailAuthenticationService();
