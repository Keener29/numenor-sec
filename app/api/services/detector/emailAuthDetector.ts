/**
 * Email Authentication Service
 * Handles SPF, DKIM, and DMARC authentication analysis from email headers
 */

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
    const authResults = headers['authentication-results'];
    if (authResults) {
      const spfMatch = authResults.match(/spf=([a-z]+)/i);
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
      const spfMatch = receivedSPF.match(/\(([a-z]+)\)/i);
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
   * Analyze DKIM (DomainKeys Identified Mail) authentication
   */
  private analyzeDKIM(headers: Record<string, string>): DKIMResult {
    // Check for DKIM results in Authentication-Results header
    const authResults = headers['authentication-results'];
    if (authResults) {
      const dkimMatch = authResults.match(/dkim=([a-z]+)/i);
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
      // If DKIM signature exists but no result in Authentication-Results,
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
    // Check for DMARC results in Authentication-Results header
    const authResults = headers['authentication-results'];
    if (authResults) {
      const dmarcMatch = authResults.match(/dmarc=([a-z]+)/i);
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
   */
  getAuthenticationRiskScore(authResults: AuthenticationResults): { risks: string[]; score: number } {
    const risks: string[] = [];
    let score = 0;

    // SPF analysis
    if (authResults.spf === 'fail') {
      risks.push('SPF authentication failed');
      score += 50;
    } else if (authResults.spf === 'softfail') {
      risks.push('SPF authentication soft fail');
      score += 40;
    } else if (authResults.spf === 'none') {
      risks.push('No SPF authentication');
      score += 25;
    }

    // DKIM analysis
    if (authResults.dkim === 'fail') {
      risks.push('DKIM authentication failed');
      score += 40;
    } else if (authResults.dkim === 'none') {
      risks.push('No DKIM authentication');
      score += 20;
    }

    // DMARC analysis
    if (authResults.dmarc === 'fail') {
      risks.push('DMARC authentication failed');
      score += 35;
    } else if (authResults.dmarc === 'none') {
      risks.push('No DMARC authentication');
      score += 20;
    }

    // Critical combination: Missing SPF + Missing DKIM = High phishing risk
    if (authResults.spf === 'none' && authResults.dkim === 'none') {
      risks.push('CRITICAL: Both SPF and DKIM authentication missing - high phishing risk');
      score += 40; // Additional penalty for this dangerous combination
    }

    // Overall assessment
    if (authResults.overall === 'fail') {
      risks.push('Email authentication completely failed');
      score += 100;
    } else if (authResults.overall === 'partial') {
      risks.push('Partial email authentication');
      score += 10;
    } else if (authResults.overall === 'none') {
      risks.push('CRITICAL: No email authentication at all');
      score += 100; // Critical - no authentication attempted
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
}

// Export singleton instance
export const emailAuthenticationService = new EmailAuthenticationService();
