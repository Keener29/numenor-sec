import { query } from '../../../db/connection.js';
import { oauthLogger } from '../logger.js';
import type { ThreatAssessment } from '../../types/email.js';
import { emailAuthenticationService, type AuthenticationResults } from './emailAuthDetector.js';
import { headerAnalyzerService, type HeaderAnalysis } from './headerAnalyzer.js';
import { linkAnalyzerService, type LinkAnalysis } from './linkAnalyzer.js';
import { attachmentAnalyzerService, type AttachmentAnalysis } from './attachmentAnalyzer.js';

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
    
  ];

  private suspiciousKeywords = [
    'verify', 'confirm', 'update', 'validate', 'secure', 'protect',
    'suspended', 'locked', 'expired', 'compromised', 'breach',
    'immediately', 'urgent', 'asap', 'deadline', 'limited time',
    'click here', 'download', 'install', 'update now'
  ];


  /**
   * Analyze email content for phishing indicators
   * @param emailData - Email data to analyze
   * @param businessId - Business ID to check for allow-listed domains
   */
  async analyzeEmail(emailData: EmailAnalysis, businessId?: number): Promise<ThreatAssessment> {
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

    // Check if sender domain is allow-listed (needed for attachment analysis)
    let isAllowListed = false;
    if (businessId) {
      isAllowListed = await emailAuthenticationService.isDomainAllowListed(businessId, emailData.sender);
    }

    // Analyze links
    let linkAnalysis: LinkAnalysis | undefined;
    if (emailData.links && emailData.links.length > 0) {
      linkAnalysis = await linkAnalyzerService.analyzeLinks(emailData.links);
      riskFactors.push(...linkAnalysis.risks);
      threatScore += linkAnalysis.score;
    }

    // Analyze attachments
    let attachmentAnalysis: AttachmentAnalysis | undefined;
    if (emailData.attachments && emailData.attachments.length > 0) {
      attachmentAnalysis = attachmentAnalyzerService.analyzeAttachments(emailData.attachments, isAllowListed);
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
    let headerAnalysis: HeaderAnalysis | undefined;
    if (emailData.headers && Object.keys(emailData.headers).length > 0) {
      authenticationResults = emailAuthenticationService.analyzeEmailAuthentication(emailData.headers);      
      const authAnalysis = emailAuthenticationService.getAuthenticationRiskScore(authenticationResults, isAllowListed);
      riskFactors.push(...authAnalysis.risks);
      threatScore += authAnalysis.score;

      // Analyze missing headers
      headerAnalysis = await headerAnalyzerService.analyzeHeaders(emailData.headers, emailData.sender, businessId);
      riskFactors.push(...headerAnalysis.risks);
      threatScore += headerAnalysis.score;
    } else {
      // No headers available - this is a CRITICAL risk factor
      
      if (isAllowListed) {
        riskFactors.push('No email headers available - sender domain is allow-listed');
        threatScore += 20; // Reduced penalty for allow-listed domains
        recommendations.push('Email headers missing - sender domain is trusted');
      } else {
        riskFactors.push('No email headers available for authentication analysis');
        threatScore += 100; // Critical - cannot verify email authenticity at all
        recommendations.push('CRITICAL: Email headers missing - unable to verify sender authenticity');
      }
    }

    // Determine threat level
    const threatLevel = this.calculateThreatLevel(threatScore);
    const confidence = Math.min(100, Math.max(0, threatScore));

    // Generate recommendations
    recommendations.push(...this.generateRecommendations(threatLevel, detectedPatterns, riskFactors));

    // Add header-specific recommendations
    if (headerAnalysis) {
      const headerRecommendations = headerAnalyzerService.generateHeaderRecommendations(headerAnalysis);
      recommendations.push(...headerRecommendations);
    }

    // Add link-specific recommendations
    if (linkAnalysis) {
      const linkRecommendations = linkAnalyzerService.generateLinkRecommendations(linkAnalysis);
      recommendations.push(...linkRecommendations);
    }

    // Add attachment-specific recommendations
    if (attachmentAnalysis) {
      const attachmentRecommendations = attachmentAnalyzerService.generateAttachmentRecommendations(attachmentAnalysis);
      recommendations.push(...attachmentRecommendations);
    }

    return {
      threatLevel,
      confidence,
      detectedPatterns: [...new Set(detectedPatterns)],
      riskFactors: [...new Set(riskFactors)],
      recommendations: [...new Set(recommendations)],
      authenticationResults,
      headerAnalysis,
      linkAnalysis,
      attachmentAnalysis
    } as ThreatAssessment;
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



    // Authentication-specific recommendations
    const authRecommendations = emailAuthenticationService.generateAuthenticationRecommendations(risks);
    recommendations.push(...authRecommendations);
    
    if (risks.some(risk => risk.includes('No email headers available'))) {
      recommendations.push('CRITICAL: Email headers missing - this email cannot be verified and should be treated as highly suspicious');
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
export type { EmailAnalysis };
