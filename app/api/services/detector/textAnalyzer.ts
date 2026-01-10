/**
 * Text Analysis Service for Phishing Detection
 * 
 * This service analyzes email text content for phishing patterns and suspicious indicators.
 * It includes pattern matching, keyword analysis, and linguistic analysis techniques.
 */

export interface PhishingPattern {
  name: string;
  pattern: RegExp;
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
  private patterns: string[] = [];
  public isAllowListed: boolean = false;
  private readonly phishingPatterns: PhishingPattern[] = [
    // High-confidence phishing patterns (more specific)
    {
      name: 'urgent_action_required',
      pattern: /(act now|click here immediately|verify now|respond immediately|urgent action required|immediate response needed)/i,
      description: 'Uses strong urgency tactics to pressure immediate action'
    },
    {
      name: 'account_suspension_threat',
      pattern: /(your account will be suspended|account suspension|account locked|account disabled|account terminated|account compromised|account expired)/i,
      description: 'Threatens account suspension or compromise'
    },
    {
      name: 'financial_urgency',
      pattern: /(payment overdue|payment due immediately|urgent payment|wire transfer urgent|confidential transfer|urgent funds)/i,
      description: 'Financial pressure with urgency tactics'
    },

    // Authority impersonation (more specific)
    {
      name: 'irs_impersonation',
      pattern: /(irs.*audit|irs.*tax|irs.*refund|irs.*payment|internal revenue service)/i,
      description: 'IRS impersonation scam'
    },
    {
      name: 'ceo_fraud',
      pattern: /(ceo|president|director|cfo|controller|vp|executive|owner)/i,
      description: 'CEO fraud or business email compromise'
    },

    // Social engineering
    {
      name: 'personal_info_request',
      pattern: /(provide your password|enter your ssn|social security number|credit card number|bank account number|personal information required)/i,
      description: 'Requests sensitive personal information'
    },
    {
      name: 'prize_winner',
      pattern: /(congratulations.*winner|congratulations.*prize|you have won|lottery winner|inheritance.*million)/i,
      description: 'Prize or lottery scam tactics'
    },
    {
      name: 'phishing_links',
      pattern: /(click here to verify|click here to confirm|click here to update|download now|install immediately)/i,
      description: 'Common phishing link text'
    },

    // Technical indicators
    {
      name: 'suspicious_html',
      pattern: /<script|<iframe|<embed|<object/i,
      description: 'Potentially malicious HTML content'
    },

    // Medium-confidence patterns (less specific, need context)
    {
      name: 'generic_urgency',
      pattern: /(urgent|asap|immediate|deadline|limited time)/i,
      description: 'Generic urgency language'
    },
    {
      name: 'generic_verification',
      pattern: /(verify|confirm|update|validate)/i,
      description: 'Generic verification language'
    },
    {
      name: 'vendor_impersonation',
      pattern: /(invoice|payment.*due|vendor|supplier|urgent.*payment)/i,
      description: 'Vendor impersonation scam'
    },
    {
      name: 'invoice_payment_due',
      pattern: /(invoice.*payment due|payment.*due immediately|urgent.*payment)/i,
      description: 'Invoice payment due scam'
    }

  ];

  // Legitimate business patterns that should reduce suspicion (negative scores)
  private readonly legitimatePatterns: PhishingPattern[] = [
    {
      name: 'meeting_request',
      pattern: /(meeting|conference call|appointment|schedule|calendar)/i,
      description: 'Meeting or scheduling related content'
    },
    {
      name: 'business_document',
      pattern: /(contract|agreement|proposal|report|presentation|document|attachment)/i,
      description: 'Business document related content'
    },
    {
      name: 'project_communication',
      pattern: /(project|task|milestone|deliverable|status update)/i,
      description: 'Project management communication'
    },
    {
      name: 'customer_service',
      pattern: /(support|help|assistance|ticket|resolution)/i,
      description: 'Customer service communication'
    },
    {
      name: 'newsletter_marketing',
      pattern: /(newsletter|news|announcement|promotion|offer)/i,
      description: 'Newsletter or marketing content'
    }
  ];

  private readonly suspiciousKeywords = [
    'verify', 'confirm', 'update', 'validate', 'secure', 'protect',
    'suspended', 'locked', 'expired', 'compromised', 'breach',
    'immediately', 'urgent', 'asap', 'deadline', 'limited time',
    'click here', 'download now', 'install now', 'update now'
  ];

  private readonly SUBJECT_WEIGHT = 1.5;

  public getPatterns(): string[] {
    return this.patterns;
  }

  /**
   * Analyze email text with subject and body distinction
   */
  analyzeEmailText(emailData: EmailTextAnalysis): TextAnalysisResult {
    const allPatterns: string[] = [];
    let subjectScore = this.analyzeText(emailData.subject);
    allPatterns.push(...this.patterns);
    const bodyScore = this.analyzeText(emailData.body);
    allPatterns.push(...this.patterns);

    // Apply context-aware weighting
    subjectScore = subjectScore * this.SUBJECT_WEIGHT;

    // Combine patterns and scores
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

  private analyzePhishingPatterns(text: string): number {
    let detectedCategoriesCount = 0;
    // Analyze phishing patterns
    for (const pattern of this.phishingPatterns) {
      if (pattern.pattern.test(text)) {
        this.patterns.push(pattern.name);
        detectedCategoriesCount += 1;
      }
    }
    return this.getSeverityScore(detectedCategoriesCount);
  }

  private checkKeywordDensity(text: string): number {
    let score = 0;
    const keywordCount = this.suspiciousKeywords.filter(keyword =>
      text.toLowerCase().includes(keyword.toLowerCase())
    ).length;

    if (keywordCount >= 3 && keywordCount < 6) {
      this.patterns.push('medium_keyword_density');
      score += 5;
    } else if (keywordCount >= 6) {
      this.patterns.push('high_keyword_density');
      score += 10;
    }
    return score
  }

  private checkExcessivePunctuation(text: string): number {
    let score = 0;
    const exclamationCount = (text.match(/!/g) || []).length;
    const questionCount = (text.match(/\?/g) || []).length;

    // Ratio based on size (avoid punishing short messages too harshly)
    const punctuationRatio = (exclamationCount + questionCount) / Math.max(text.length, 1);

    // Detect clusters like "!!!", "??", "!?!?", etc
    const punctuationClusters = (text.match(/([!?]{3,})/g) || []).length;

    // Score logic
    if (punctuationRatio > 0.05 || punctuationClusters > 0) {
      this.patterns.push('excessive_punctuation');

      // weighted scoring
      let punctScore = 0;

      if (punctuationRatio > 0.1) punctScore += 5;      // aggressive punctuation density
      if (punctuationClusters >= 3) punctScore += 10;   // ultra spammy

      score += punctScore;
    }
    return score;
  }

  private checkExcessiveCaps(text: string): number {
    let score = 0;
    const capsSequences = (text.match(/[A-Z]{5,}/g) || []).length;
    const capsPercentage = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);

    if (capsPercentage > 0.4 && capsSequences > 0) {
      this.patterns.push('excessive_caps');

      // scale
      let capsScore = 5;
      if (capsPercentage > 0.6) capsScore += 5;
      if (capsSequences > 2) capsScore += 5;

      score += capsScore;
    }
    return score;
  }

  analyzeText(text: string): number {
    this.patterns = [];
    let score = 0;

    score += this.analyzePhishingPatterns(text);
    score += this.checkKeywordDensity(text);
    score += this.checkExcessivePunctuation(text);
    score += this.checkExcessiveCaps(text);

    return score;
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
        legitimateScore -= 5;
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
  private getSeverityScore(severity: number): number {
    let score = 0;
    if (severity <= 1){
      return 0;
    } else if (severity == 2){
      score = 9;
    } else if (severity == 3) {
      score = 30;
    } else {
      score = 60;
    }
    return this.isAllowListed ? score/3: score;
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
