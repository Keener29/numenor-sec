/**
 * Email Authentication Service
 * Handles SPF, DKIM, and DMARC authentication analysis from email headers
 */

import { query } from '../../../db/connection.js';
import { emailLogger } from '../../../utils/logger.js';

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
      const spfRegex = /spf=([a-z]+)/i;
      const spfMatch = spfRegex.exec(normalized);
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
      const spfRegex = /^([a-z]+)\s*\(/i;
      const spfMatch = spfRegex.exec(normalized);
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
    return headerValue.replaceAll(/[\r\n]+/g, ' ').replaceAll(/\s+/g, ' ').trim();
  }

  /**
   * Analyze DKIM (DomainKeys Identified Mail) authentication
   */
  private analyzeDKIM(headers: Record<string, string>): DKIMResult {

    // Check for DKIM results in ARC-Authentication-Results header
    // ARC (Authenticated Received Chain) preserves authentication results across intermediaries
    
    const arcAuthResults = headers['ARC-Authentication-Results'] ?? headers['arc-authentication-results'];
    const normalizedArcAuthResults = arcAuthResults && this.normalizeHeaderValue(arcAuthResults);
    const dkimRegex = /dkim=([a-z]+)/i;
    const resultArc = dkimRegex.exec(normalizedArcAuthResults)?.[1].toLowerCase();
    if (resultArc === 'pass' && isValidDKIMResult(resultArc)) {
      return resultArc;
    }

    const authResults = headers['Authentication-Results'] ?? headers['authentication-results'];
    const normalizedAuthResults = authResults && this.normalizeHeaderValue(authResults);
    const resultAuth = dkimRegex.exec(normalizedAuthResults)?.[1].toLowerCase();
    if (resultAuth && isValidDKIMResult(resultAuth)) {
      return resultAuth;
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
    const arcAuthResults = headers['ARC-Authentication-Results'] ?? headers['arc-authentication-results'];
    const normalizedArcAuthResults = arcAuthResults && this.normalizeHeaderValue(arcAuthResults);
    const dmarcRegex = /dmarc=([a-z]+)/i;
    const resultArc = dmarcRegex.exec(normalizedArcAuthResults)?.[1].toLowerCase();
    if (resultArc === 'pass' && isValidDMARCResult(resultArc)) {
      return resultArc;
    }

    const authResults = headers['Authentication-Results'] ?? headers['authentication-results'];
    const normalizedAuthResults = authResults && this.normalizeHeaderValue(authResults);
    const resultAuth = dmarcRegex.exec(normalizedAuthResults)?.[1].toLowerCase();
    if (resultAuth && isValidDMARCResult(resultAuth)) {
      return resultAuth;
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

    score += this.spfScore(authResults.spf, risks, isAllowListed);
    score += this.dkimScore(authResults.dkim, risks, isAllowListed);
    score += this.dmarcScore(authResults.dmarc, risks, isAllowListed);
    score += this.spfDkimCombinedScore(authResults.spf, authResults.dkim, risks, isAllowListed);
    score += this.overallAuthRiskScore(authResults.overall, risks, isAllowListed);

    return { risks, score };
  }

  spfScore(spf: SPFResult, risks: string[], isAllowListed: boolean = false): number {
    let score = 0;
    if (spf === 'fail') {
      risks.push('SPF authentication failed');
      score += isAllowListed ? 15 : 50;
    } else if (spf === 'softfail') {
      risks.push('SPF authentication soft fail');
      score += isAllowListed ? 10 : 40;
    } else if (spf === 'none') {
      risks.push('No SPF authentication');
      score += isAllowListed ? 3 : 25;
    }
    return score;
  }

  dkimScore(dkim: DKIMResult, risks: string[], isAllowListed: boolean = false): number {
    let score = 0;
    if (dkim === 'fail') {
      risks.push('DKIM authentication failed');
      score += isAllowListed ? 15 : 40;
    } else if (dkim === 'none') {
      risks.push('No DKIM authentication');
      score += isAllowListed ? 3 : 20;
    }
    return score;
  }

  dmarcScore(dmarc: DMARCResult, risks: string[], isAllowListed: boolean = false): number {
    let score = 0;
    if (dmarc === 'fail') {
      risks.push('DMARC authentication failed');
      score += isAllowListed ? 12 : 35;
    } else if (dmarc === 'none') {
      risks.push('No DMARC authentication');
      score += isAllowListed ? 0 : 20;
    }
    return score;
  }
  
  spfDkimCombinedScore(spf: SPFResult, dkim: DKIMResult, risks: string[], isAllowListed: boolean = false): number {
    let score = 0;
    // Critical combination: Missing SPF + Missing DKIM = High phishing risk
    if (spf === 'none' && dkim === 'none') {
      if (isAllowListed) {
        risks.push('Both SPF and DKIM authentication missing - sender domain is allow-listed');
        score += 2;
      } else {
        risks.push('CRITICAL: Both SPF and DKIM authentication missing - high phishing risk');
        score += 40;
      }
    }
    return score;
  }
  
  overallAuthRiskScore(overall: OverallAuthResult, risks: string[], isAllowListed: boolean = false): number {
    let score = 0;
    // Overall assessment
    if (overall === 'fail') {
      if (isAllowListed) {
        risks.push('Email authentication failed - sender domain is allow-listed');
        score += 20;
      } else {
        risks.push('Email authentication completely failed');
        score += 100;
      }
    } else if (overall === 'partial') {
      risks.push('Partial email authentication');
    } else if (overall === 'none') {
      if (isAllowListed) {
        risks.push('No email authentication - sender domain is allow-listed');
        score += 5;
      } else {
        risks.push('CRITICAL: No email authentication at all');
        score += 100;
      }
    }
    return score;
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

      const count = Number.parseInt((result.rows[0] as { count: string }).count);
      return count > 0;
    } catch (error) {
      // If there's an error checking the database, default to not allow-listed
      emailLogger.warn(`Error checking if sender domain is allow-listed: ${error}`, { operation: 'email-authentication' }, { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }
}

// Export singleton instance
export const emailAuthenticationService = new EmailAuthenticationService();
