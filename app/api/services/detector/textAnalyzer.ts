/**
 * Text Analysis Service for Phishing Detection
 * 
 * This service analyzes email text content for phishing patterns and suspicious indicators.
 * It includes pattern matching, keyword analysis, and linguistic analysis techniques.
 */

export interface PhishingPattern {
  name: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface TextAnalysisResult {
  patterns: string[];
  score: number;
  subjectScore?: number;
  bodyScore?: number;
  context?: string;
}

export interface EmailTextAnalysis {
  subject: string;
  body: string;
  sender?: string;
  recipient?: string;
}

export class TextAnalyzer {
  private phishingPatterns: PhishingPattern[] = [
    // High-confidence phishing patterns (more specific)
    {
      name: 'urgent_action_required',
      pattern: /(act now|click here immediately|verify now|respond immediately|urgent action required|immediate response needed)/i,
      severity: 'high',
      description: 'Uses strong urgency tactics to pressure immediate action'
    },
    {
      name: 'account_suspension_threat',
      pattern: /(your account will be suspended|account suspension|account locked|account disabled|account terminated|account compromised|account expired)/i,
      severity: 'high',
      description: 'Threatens account suspension or compromise'
    },
    {
      name: 'financial_urgency',
      pattern: /(payment overdue|payment due immediately|urgent payment|wire transfer urgent|confidential transfer|urgent funds)/i,
      severity: 'high',
      description: 'Financial pressure with urgency tactics'
    },
    
    // Authority impersonation (more specific)
    {
      name: 'irs_impersonation',
      pattern: /(irs.*audit|irs.*tax|irs.*refund|irs.*payment|internal revenue service)/i,
      severity: 'critical',
      description: 'IRS impersonation scam'
    },
    {
      name: 'ceo_fraud',
      pattern: /(ceo.*urgent|president.*confidential|director.*wire|manager.*transfer|executive.*funds)/i,
      severity: 'critical',
      description: 'CEO fraud or business email compromise'
    },
    
    // Social engineering
    {
      name: 'personal_info_request',
      pattern: /(provide your password|enter your ssn|social security number|credit card number|bank account number|personal information required)/i,
      severity: 'high',
      description: 'Requests sensitive personal information'
    },
    {
      name: 'prize_winner',
      pattern: /(congratulations.*winner|congratulations.*prize|you have won|lottery winner|inheritance.*million)/i,
      severity: 'medium',
      description: 'Prize or lottery scam tactics'
    },
    {
      name: 'phishing_links',
      pattern: /(click here to verify|click here to confirm|click here to update|download now|install immediately)/i,
      severity: 'low',
      description: 'Common phishing link text'
    },
    
    // Technical indicators
    {
      name: 'suspicious_html',
      pattern: /<script|<iframe|<embed|<object/i,
      severity: 'medium',
      description: 'Potentially malicious HTML content'
    },
    
    // Medium-confidence patterns (less specific, need context)
    {
      name: 'generic_urgency',
      pattern: /(urgent|asap|immediate|deadline|limited time)/i,
      severity: 'low',
      description: 'Generic urgency language'
    },
    {
      name: 'generic_verification',
      pattern: /(verify|confirm|update|validate)/i,
      severity: 'low',
      description: 'Generic verification language'
    },
    
  ];

  // Legitimate business patterns that should reduce suspicion (negative scores)
  private legitimatePatterns: PhishingPattern[] = [
    {
      name: 'meeting_request',
      pattern: /(meeting|conference call|appointment|schedule|calendar)/i,
      severity: 'low',
      description: 'Meeting or scheduling related content'
    },
    {
      name: 'business_document',
      pattern: /(contract|agreement|proposal|report|presentation|document|attachment)/i,
      severity: 'low',
      description: 'Business document related content'
    },
    {
      name: 'project_communication',
      pattern: /(project|task|milestone|deliverable|status update)/i,
      severity: 'low',
      description: 'Project management communication'
    },
    {
      name: 'customer_service',
      pattern: /(support|help|assistance|ticket|resolution)/i,
      severity: 'low',
      description: 'Customer service communication'
    },
    {
      name: 'newsletter_marketing',
      pattern: /(newsletter|news|announcement|promotion|offer)/i,
      severity: 'low',
      description: 'Newsletter or marketing content'
    }
  ];

  private suspiciousKeywords = [
    'verify', 'confirm', 'update', 'validate', 'secure', 'protect',
    'suspended', 'locked', 'expired', 'compromised', 'breach',
    'immediately', 'urgent', 'asap', 'deadline', 'limited time',
    'click here', 'download now', 'install now', 'update now'
  ];

  private readonly SUBJECT_WEIGHT = 1.5;
  private readonly LOW_SEVERITY_CAP = 20; // Maximum contribution from low severity patterns

  /**
   * Analyze email text with subject and body distinction
   */
  analyzeEmailText(emailData: EmailTextAnalysis): TextAnalysisResult {
    const subjectResult = this.analyzeText(emailData.subject);
    const bodyResult = this.analyzeText(emailData.body);
    
    // Apply context-aware weighting
    const subjectScore = subjectResult.score * this.SUBJECT_WEIGHT;
    const bodyScore = bodyResult.score;
    
    // Combine patterns and scores
    const allPatterns = [...subjectResult.patterns, ...bodyResult.patterns];
    const totalScore = subjectScore + bodyScore;
    
    // Apply legitimate pattern reduction (negative scores)
    const legitimateScore = this.analyzeLegitimatePatterns(emailData.subject + ' ' + emailData.body);
    const finalScore = Math.max(0, totalScore + legitimateScore);
    
    return {
      patterns: [...new Set(allPatterns)],
      score: finalScore,
      subjectScore,
      bodyScore,
      context: this.determineContext(emailData)
    };
  }

  analyzeText(text: string): TextAnalysisResult {
    const patterns: string[] = [];
    let score = 0;
    let lowSeverityScore = 0;

    // Analyze phishing patterns
    for (const pattern of this.phishingPatterns) {
      if (pattern.pattern.test(text)) {
        patterns.push(pattern.name);
        const patternScore = this.getSeverityScore(pattern.severity);
        
        if (pattern.severity === 'low') {
          lowSeverityScore += patternScore;
        } else {
          score += patternScore;
        }
      }
    }

    // Cap low severity contributions
    score += Math.min(lowSeverityScore, this.LOW_SEVERITY_CAP);

    // Check for suspicious keyword density
    const keywordCount = this.suspiciousKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword.toLowerCase())
    ).length;
    
    if (keywordCount >= 3 && keywordCount < 6) {
      patterns.push('medium_keyword_density');
      score += 5;
    } else if (keywordCount >= 6) {
      patterns.push('high_keyword_density');
      score += 10;
    }

    // Check for excessive punctuation
    const exclamationCount = (text.match(/!/g) || []).length;
    const questionCount = (text.match(/\?/g) || []).length;
    
    // Ratio based on size (avoid punishing short messages too harshly)
    const punctuationRatio = (exclamationCount + questionCount) / Math.max(text.length, 1);

    // Detect clusters like "!!!", "??", "!?!?", etc
    const punctuationClusters = (text.match(/([!?]{3,})/g) || []).length;

    // Score logic
    if (punctuationRatio > 0.05 || punctuationClusters > 0) {
      patterns.push('excessive_punctuation');

      // weighted scoring
      let punctScore = 0;

      if (punctuationRatio > 0.1) punctScore += 5;      // aggressive punctuation density
      if (punctuationClusters >= 3) punctScore += 10;   // ultra spammy

      score += punctScore;
    }

    const capsSequences = (text.match(/[A-Z]{5,}/g) || []).length;
    const capsPercentage = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);

    if (capsPercentage > 0.4 && capsSequences > 0) {
      patterns.push('excessive_caps');

      // scale
      let capsScore = 5;
      if (capsPercentage > 0.6) capsScore += 5;
      if (capsSequences > 2) capsScore += 5;

      score += capsScore;
    }

    return { patterns, score };
  }

  /**
   * Analyze legitimate business patterns to reduce false positives
   * Returns negative scores to reduce overall suspicion
   */
  private analyzeLegitimatePatterns(text: string): number {
    let legitimateScore = 0;
    
    for (const pattern of this.legitimatePatterns) {
      if (pattern.pattern.test(text)) {
        // Return negative scores to reduce suspicion
        legitimateScore -= this.getSeverityScore(pattern.severity);
      }
    }
    
    return legitimateScore;
  }

  /**
   * Determine the context of the email to adjust scoring
   */
  private determineContext(emailData: EmailTextAnalysis): string {
    const text = (emailData.subject + ' ' + emailData.body).toLowerCase();
    
    if (text.includes('meeting') || text.includes('conference')) {
      return 'meeting';
    }
    if (text.includes('invoice') || text.includes('payment') || text.includes('billing')) {
      return 'financial';
    }
    if (text.includes('support') || text.includes('ticket')) {
      return 'support';
    }
    if (text.includes('newsletter') || text.includes('news')) {
      return 'newsletter';
    }
    
    return 'general';
  }

  /**
   * Get severity score for pattern matching
   */
  private getSeverityScore(severity: string): number {
    switch (severity) {
      case 'low': return 5;
      case 'medium': return 15;
      case 'high': return 30;
      case 'critical': return 50;
      default: return 10;
    }
  }

  /**
   * (for testing or external use)
   */
  getPhishingPatterns(): PhishingPattern[] {
    return [...this.phishingPatterns];
  }

  /**
   * (for testing or external use)
   */
  getLegitimatePatterns(): PhishingPattern[] {
    return [...this.legitimatePatterns];
  }

  /**
   * (for testing or external use)
   */
  getSuspiciousKeywords(): string[] {
    return [...this.suspiciousKeywords];
  }
}

// Export singleton instance
export const textAnalyzer = new TextAnalyzer();
