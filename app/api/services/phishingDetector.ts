import { query } from '../../db/connection.js';
import { oauthLogger } from './logger.js';
import type { ThreatAssessment } from '../types/email.js';

// Authentication result types
type SPFResult = 'pass' | 'fail' | 'softfail' | 'neutral' | 'none' | 'temperror' | 'permerror';
type DKIMResult = 'pass' | 'fail' | 'none' | 'temperror' | 'permerror';
type DMARCResult = 'pass' | 'fail' | 'none' | 'temperror' | 'permerror';
type OverallAuthResult = 'pass' | 'fail' | 'partial' | 'none';

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

interface AuthenticationResults {
  spf: SPFResult;
  dkim: DKIMResult;
  dmarc: DMARCResult;
  overall: OverallAuthResult;
}

// Phishing detection patterns and rules
interface PhishingPattern {
  name: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

interface EmailAnalysis {
  subject: string;
  body: string;
  sender: string;
  recipient: string;
  attachments?: string[];
  links?: string[];
  headers?: Record<string, string>;
}


class PhishingDetector {
  private phishingPatterns: PhishingPattern[] = [
    // Urgency and fear tactics
    {
      name: 'urgent_action_required',
      pattern: /(urgent|immediate|asap|expires?|deadline|limited time|act now|click here|verify now)/i,
      severity: 'medium',
      description: 'Uses urgency tactics to pressure immediate action'
    },
    {
      name: 'account_suspension',
      pattern: /(account.*suspend|suspended|locked|disabled|terminated|expired|compromised)/i,
      severity: 'high',
      description: 'Threatens account suspension or compromise'
    },
    {
      name: 'financial_threat',
      pattern: /(payment.*due|overdue|charge|billing|invoice|refund|credit card|bank account)/i,
      severity: 'high',
      description: 'Financial pressure or fake billing'
    },
    
    // Authority impersonation
    {
      name: 'authority_impersonation',
      pattern: /(irs|fbi|police|court|legal|government|official|security|admin|support)/i,
      severity: 'medium',
      description: 'Impersonates authority figures or institutions'
    },
    {
      name: 'ceo_fraud',
      pattern: /(ceo|president|director|manager|boss|executive).*(urgent|confidential|wire|transfer)/i,
      severity: 'critical',
      description: 'CEO fraud or business email compromise'
    },
    
    // Suspicious links and domains
    {
      name: 'suspicious_domain',
      pattern: /(bit\.ly|tinyurl|goo\.gl|t\.co|short\.link|redirect)/i,
      severity: 'medium',
      description: 'Uses URL shorteners or redirect services'
    },
    {
      name: 'typo_squatting',
      pattern: /(gmail\.co|yahoo\.co|outlook\.co|amazon\.co|paypal\.co|apple\.co)/i,
      severity: 'high',
      description: 'Potential typo-squatting domains'
    },
    
    // Social engineering
    {
      name: 'personal_info_request',
      pattern: /(password|ssn|social security|credit card|bank account|personal information)/i,
      severity: 'high',
      description: 'Requests sensitive personal information'
    },
    {
      name: 'prize_winner',
      pattern: /(congratulations|winner|prize|lucky|lottery|inheritance|million)/i,
      severity: 'medium',
      description: 'Prize or lottery scam tactics'
    },
    
    // Technical indicators
    {
      name: 'suspicious_attachments',
      pattern: /\.(exe|scr|bat|cmd|com|pif|vbs|js|jar|zip|rar|7z)$/i,
      severity: 'high',
      description: 'Potentially malicious file attachments'
    },
    {
      name: 'html_embedded_content',
      pattern: /<iframe|<script|<embed|<object/i,
      severity: 'medium',
      description: 'Embedded HTML content that could be malicious'
    },
    
    // Email authentication failure patterns
    {
      name: 'spf_failure',
      pattern: /spf.*fail|received-spf.*fail/i,
      severity: 'high',
      description: 'SPF authentication failure detected'
    },
    {
      name: 'dkim_failure',
      pattern: /dkim.*fail|dkim-signature.*invalid/i,
      severity: 'high',
      description: 'DKIM authentication failure detected'
    },
    {
      name: 'dmarc_failure',
      pattern: /dmarc.*fail|dmarc.*reject/i,
      severity: 'critical',
      description: 'DMARC authentication failure detected'
    },
    {
      name: 'authentication_missing',
      pattern: /no.*authentication|missing.*spf|missing.*dkim|missing.*dmarc/i,
      severity: 'medium',
      description: 'Missing email authentication records'
    },
    {
      name: 'headers_missing',
      pattern: /no.*headers|missing.*headers|headers.*unavailable/i,
      severity: 'critical',
      description: 'Email headers are missing or unavailable - cannot verify authenticity'
    },
    {
      name: 'no_spf_dkim',
      pattern: /no.*spf.*dkim|missing.*spf.*dkim|no.*authentication.*spf.*dkim/i,
      severity: 'critical',
      description: 'Both SPF and DKIM authentication missing - high phishing risk'
    }
  ];

  private suspiciousKeywords = [
    'verify', 'confirm', 'update', 'validate', 'secure', 'protect',
    'suspended', 'locked', 'expired', 'compromised', 'breach',
    'immediately', 'urgent', 'asap', 'deadline', 'limited time',
    'click here', 'download', 'install', 'update now'
  ];

  private trustedDomains = [
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
    'apple.com', 'microsoft.com', 'google.com', 'amazon.com',
    'paypal.com', 'ebay.com', 'facebook.com', 'twitter.com'
  ];

  /**
   * Analyze email content for phishing indicators
   */
  async analyzeEmail(emailData: EmailAnalysis): Promise<ThreatAssessment> {
    const detectedPatterns: string[] = [];
    const riskFactors: string[] = [];
    const recommendations: string[] = [];
    let threatScore = 0;

    // Analyze subject line
    const subjectAnalysis = this.analyzeText(emailData.subject);
    detectedPatterns.push(...subjectAnalysis.patterns);
    threatScore += subjectAnalysis.score;

    // Analyze email body
    const bodyAnalysis = this.analyzeText(emailData.body);
    detectedPatterns.push(...bodyAnalysis.patterns);
    threatScore += bodyAnalysis.score;

    // Analyze sender
    const senderAnalysis = this.analyzeSender(emailData.sender);
    riskFactors.push(...senderAnalysis.risks);
    threatScore += senderAnalysis.score;

    // Analyze links
    if (emailData.links && emailData.links.length > 0) {
      const linkAnalysis = this.analyzeLinks(emailData.links);
      riskFactors.push(...linkAnalysis.risks);
      threatScore += linkAnalysis.score;
    }

    // Analyze attachments
    if (emailData.attachments && emailData.attachments.length > 0) {
      const attachmentAnalysis = this.analyzeAttachments(emailData.attachments);
      riskFactors.push(...attachmentAnalysis.risks);
      threatScore += attachmentAnalysis.score;
    }

    // Check for business email compromise patterns
    const becAnalysis = this.analyzeBusinessEmailCompromise(emailData);
    if (becAnalysis.isBEC) {
      threatScore += 50;
      riskFactors.push('Potential Business Email Compromise');
      recommendations.push('Verify sender identity through alternative communication channel');
    }

    // Analyze email authentication (SPF, DKIM, DMARC)
    let authenticationResults;
    if (emailData.headers && Object.keys(emailData.headers).length > 0) {
      authenticationResults = this.analyzeEmailAuthentication(emailData.headers);
      const authAnalysis = this.getAuthenticationRiskScore(authenticationResults);
      riskFactors.push(...authAnalysis.risks);
      threatScore += authAnalysis.score;
    } else {
      // No headers available - this is a CRITICAL risk factor
      riskFactors.push('No email headers available for authentication analysis');
      threatScore += 100; // Critical - cannot verify email authenticity at all
      recommendations.push('CRITICAL: Email headers missing - unable to verify sender authenticity');
    }

    // Determine threat level
    const threatLevel = this.calculateThreatLevel(threatScore);
    const confidence = Math.min(100, Math.max(0, threatScore));

    // Generate recommendations
    recommendations.push(...this.generateRecommendations(threatLevel, detectedPatterns, riskFactors));

    return {
      threatLevel,
      confidence,
      detectedPatterns: [...new Set(detectedPatterns)],
      riskFactors: [...new Set(riskFactors)],
      recommendations: [...new Set(recommendations)],
      authenticationResults
    };
  }

  /**
   * Analyze text content for phishing patterns
   */
  private analyzeText(text: string): { patterns: string[]; score: number } {
    const patterns: string[] = [];
    let score = 0;

    for (const pattern of this.phishingPatterns) {
      if (pattern.pattern.test(text)) {
        patterns.push(pattern.name);
        score += this.getSeverityScore(pattern.severity);
      }
    }

    // Check for suspicious keyword density
    const keywordCount = this.suspiciousKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    
    if (keywordCount >= 3) {
      patterns.push('high_keyword_density');
      score += 15;
    }

    // Check for excessive punctuation (common in phishing)
    const exclamationCount = (text.match(/!/g) || []).length;
    const questionCount = (text.match(/\?/g) || []).length;
    if (exclamationCount > 3 || questionCount > 3) {
      patterns.push('excessive_punctuation');
      score += 10;
    }

    return { patterns, score };
  }

  /**
   * Analyze sender information
   */
  private analyzeSender(sender: string): { risks: string[]; score: number } {
    const risks: string[] = [];
    let score = 0;

    // Extract domain from email
    const domain = sender.split('@')[1]?.toLowerCase();
    
    if (!domain) {
      risks.push('Invalid sender format');
      score += 20;
      return { risks, score };
    }

    // Check if domain is trusted
    if (!this.trustedDomains.includes(domain)) {
      risks.push('Unknown sender domain');
      score += 10;
    }

    // Check for suspicious sender patterns
    if (domain.includes('temp') || domain.includes('disposable')) {
      risks.push('Temporary or disposable email address');
      score += 25;
    }

    // Check for domain spoofing indicators
    if (this.isDomainSpoofing(sender)) {
      risks.push('Potential domain spoofing');
      score += 30;
    }

    return { risks, score };
  }

  /**
   * Analyze links in email
   */
  private analyzeLinks(links: string[]): { risks: string[]; score: number } {
    const risks: string[] = [];
    let score = 0;

    for (const link of links) {
      try {
        const url = new URL(link);
        
        // Check for URL shorteners
        if (this.isUrlShortener(url.hostname)) {
          risks.push('URL shortener detected');
          score += 15;
        }

        // Check for suspicious domains
        if (this.isSuspiciousDomain(url.hostname)) {
          risks.push('Suspicious domain in link');
          score += 20;
        }

        // Check for IP addresses in URLs
        if (this.isIPAddress(url.hostname)) {
          risks.push('IP address in URL');
          score += 25;
        }

        // Check for mixed content (HTTP on HTTPS page)
        if (url.protocol === 'http:') {
          risks.push('Insecure HTTP link');
          score += 10;
        }

      } catch (error) {
        risks.push('Malformed URL');
        score += 20;
      }
    }

    return { risks, score };
  }

  /**
   * Analyze email attachments
   */
  private analyzeAttachments(attachments: string[]): { risks: string[]; score: number } {
    const risks: string[] = [];
    let score = 0;

    for (const attachment of attachments) {
      const extension = attachment.split('.').pop()?.toLowerCase();
      
      if (this.isExecutableFile(extension)) {
        risks.push('Executable file attachment');
        score += 30;
      }

      if (this.isArchiveFile(extension)) {
        risks.push('Archive file attachment');
        score += 15;
      }

      if (this.isScriptFile(extension)) {
        risks.push('Script file attachment');
        score += 25;
      }
    }

    return { risks, score };
  }

  /**
   * Analyze email authentication headers (SPF, DKIM, DMARC)
   */
  private analyzeEmailAuthentication(headers: Record<string, string>): AuthenticationResults {
    const spf = this.analyzeSPF(headers);
    const dkim = this.analyzeDKIM(headers);
    const dmarc = this.analyzeDMARC(headers);
    
    // Determine overall authentication status
    let overall: 'pass' | 'fail' | 'partial' | 'none' = 'none';
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
  private getAuthenticationRiskScore(authResults: AuthenticationResults): { risks: string[]; score: number } {
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
   * Analyze for Business Email Compromise (BEC)
   */
  private analyzeBusinessEmailCompromise(emailData: EmailAnalysis): { isBEC: boolean; indicators: string[] } {
    const indicators: string[] = [];
    let isBEC = false;

    // Check for executive impersonation
    if (this.phishingPatterns.find(p => p.name === 'ceo_fraud')?.pattern.test(emailData.subject + ' ' + emailData.body)) {
      indicators.push('Executive impersonation detected');
      isBEC = true;
    }

    // Check for wire transfer requests
    if (/(wire|transfer|payment|urgent.*funds|confidential.*transaction)/i.test(emailData.body)) {
      indicators.push('Wire transfer request');
      isBEC = true;
    }

    // Check for vendor impersonation
    if (/(invoice|payment.*due|vendor|supplier|urgent.*payment)/i.test(emailData.body)) {
      indicators.push('Vendor impersonation');
      isBEC = true;
    }

    return { isBEC, indicators };
  }

  /**
   * Calculate threat level based on score
   */
  private calculateThreatLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  /**
   * Generate recommendations based on threat assessment
   */
  private generateRecommendations(
    threatLevel: string, 
    patterns: string[], 
    risks: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (threatLevel === 'critical') {
      recommendations.push('IMMEDIATE ACTION REQUIRED: Do not click any links or download attachments');
      recommendations.push('Notify your manager immediately');
      recommendations.push('Verify sender identity through alternative communication');
    }

    if (patterns.includes('personal_info_request')) {
      recommendations.push('Never provide personal information via email');
      recommendations.push('Contact the organization directly through official channels');
    }

    if (patterns.includes('urgent_action_required')) {
      recommendations.push('Be cautious of urgent requests - legitimate organizations rarely require immediate action');
    }

    if (risks.includes('URL shortener detected')) {
      recommendations.push('Avoid clicking shortened URLs - use a URL expander to check destination');
    }

    if (risks.includes('Executable file attachment')) {
      recommendations.push('Do not open executable files from unknown senders');
    }

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
    if (risks.some(risk => risk.includes('No email headers available'))) {
      recommendations.push('CRITICAL: Email headers missing - this email cannot be verified and should be treated as highly suspicious');
    }
    if (risks.some(risk => risk.includes('Both SPF and DKIM authentication missing'))) {
      recommendations.push('CRITICAL: No SPF or DKIM authentication - this email is highly suspicious and likely phishing');
    }

    return recommendations;
  }

  // Helper methods
  private getSeverityScore(severity: string): number {
    switch (severity) {
      case 'critical': return 30;
      case 'high': return 20;
      case 'medium': return 10;
      case 'low': return 5;
      default: return 0;
    }
  }

  private isDomainSpoofing(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;

    // Check for common spoofing patterns
    const spoofingPatterns = [
      /^[a-z0-9]+-[a-z0-9]+\./, // hyphenated domains
      /\.co$/, // .co instead of .com
      /^[a-z0-9]+[0-9]+\./, // domains with numbers
    ];

    return spoofingPatterns.some(pattern => pattern.test(domain));
  }

  private isUrlShortener(hostname: string): boolean {
    const shorteners = [
      'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'short.link',
      'ow.ly', 'buff.ly', 'is.gd', 'v.gd', 'tiny.cc'
    ];
    return shorteners.includes(hostname.toLowerCase());
  }

  private isSuspiciousDomain(hostname: string): boolean {
    // Check for domains that look like legitimate ones but aren't
    const suspiciousPatterns = [
      /gmail\.co$/, /yahoo\.co$/, /outlook\.co$/, /amazon\.co$/,
      /paypal\.co$/, /apple\.co$/, /microsoft\.co$/
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(hostname));
  }

  private isIPAddress(hostname: string): boolean {
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipPattern.test(hostname);
  }

  private isExecutableFile(extension?: string): boolean {
    const executables = ['exe', 'scr', 'bat', 'cmd', 'com', 'pif', 'vbs', 'js'];
    return extension ? executables.includes(extension) : false;
  }

  private isArchiveFile(extension?: string): boolean {
    const archives = ['zip', 'rar', '7z', 'tar', 'gz'];
    return extension ? archives.includes(extension) : false;
  }

  private isScriptFile(extension?: string): boolean {
    const scripts = ['js', 'vbs', 'ps1', 'sh', 'bat', 'cmd'];
    return extension ? scripts.includes(extension) : false;
  }

  /**
   * Store threat assessment in database
   */
  async storeThreatAssessment(
    businessId: number,
    emailId: number,
    assessment: ThreatAssessment,
    emailData: EmailAnalysis
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO phishing_alerts (
          business_id, email_id, subject, sender_email, recipient_email,
          threat_level, status, alert_type, description, raw_email_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          businessId,
          emailId,
          emailData.subject,
          emailData.sender,
          emailData.recipient,
          assessment.threatLevel,
          'pending',
          'phishing_detection',
          `Threat Level: ${assessment.threatLevel.toUpperCase()}. Confidence: ${assessment.confidence}%. Patterns: ${assessment.detectedPatterns.join(', ')}`,
          JSON.stringify({
            assessment,
            emailData,
            timestamp: new Date().toISOString()
          })
        ]
      );
    } catch (error) {
      oauthLogger.error('Failed to store threat assessment', {
        operation: 'store-threat-assessment',
        metadata: { businessId, emailId, threatLevel: assessment.threatLevel }
      }, error as Error);
      throw error;
    }
  }

  /**
   * Get threat statistics for dashboard
   */
  async getThreatStatistics(businessId: number, days: number = 30): Promise<any> {
    try {
      const result = await query(
        `SELECT 
          threat_level,
          COUNT(*) as count,
          DATE(created_at) as date
        FROM phishing_alerts 
        WHERE business_id = $1 
          AND created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY threat_level, DATE(created_at)
        ORDER BY date DESC`,
        [businessId]
      );

      return result.rows || [];
    } catch (error) {
      oauthLogger.error('Failed to get threat statistics', {
        operation: 'get-threat-statistics',
        metadata: { businessId }
      }, error as Error);
      // Return empty array instead of throwing
      return [];
    }
  }
}

export const phishingDetector = new PhishingDetector();
export type { EmailAnalysis, AuthenticationResults, SPFResult, DKIMResult, DMARCResult, OverallAuthResult };
