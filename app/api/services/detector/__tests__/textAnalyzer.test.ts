import { textAnalyzer } from '../textAnalyzer.js';
import { describe, expect, it, jest } from '@jest/globals';

describe('TextAnalyzer', () => {
  describe('analyzeEmailText', () => {
    it('should detect urgent action patterns in subject', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'URGENT: Act now to verify your account!',
        body: 'This is a normal email body.'
      });
      
      expect(result.patterns).toContain('urgent_action_required');
      expect(result.score).toBeGreaterThan(0);
      expect(result.subjectScore).toBeGreaterThan(result.bodyScore || 0);
    });

    it('should detect account suspension threats', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'Account Suspension Notice',
        body: 'Your account will be suspended due to suspicious activity'
      });
      
      expect(result.patterns).toContain('account_suspension_threat');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect CEO fraud patterns', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'CEO Urgent Request',
        body: 'CEO urgent confidential wire transfer needed'
      });
      
      expect(result.patterns).toContain('ceo_fraud');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect medium keyword density in subject', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'Verify and confirm your account update immediately',
        body: 'This is a normal email body.'
      });
      
      expect(result.patterns).toContain('medium_keyword_density');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect excessive punctuation in subject', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'URGENT!!! Verify now!!!',
        body: 'This is a normal email body.'
      });
      
      expect(result.patterns).toContain('excessive_punctuation');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should detect excessive caps in subject', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'URGENT ACCOUNT VERIFICATION REQUIRED',
        body: 'This is a normal email body.'
      });
      
      expect(result.patterns).toContain('excessive_caps');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should return low score for legitimate business emails', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'Meeting Request for Tomorrow',
        body: 'Hi, I would like to schedule a meeting for tomorrow to discuss the project status and deliverables.'
      });
      
      expect(result.score).toBeLessThan(20); // Should be low due to legitimate patterns reducing suspicion
      expect(result.context).toBe('meeting');
    });

    it('should handle multiple patterns across subject and body', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'URGENT: Account Suspension',
        body: 'Your account will be suspended! Click here to verify immediately!'
      });
      
      expect(result.patterns.length).toBeGreaterThan(1);
      expect(result.patterns).toContain('generic_urgency');
      expect(result.patterns).toContain('account_suspension_threat');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should apply subject weight correctly', () => {
      const subjectResult = textAnalyzer.analyzeEmailText({
        subject: 'URGENT: Verify now!',
        body: 'Normal body text.'
      });
      
      const bodyResult = textAnalyzer.analyzeEmailText({
        subject: 'Normal subject.',
        body: 'URGENT: Verify now!'
      });
      
      // Subject should have higher impact due to 1.5x weight
      expect(subjectResult.subjectScore).toBeGreaterThan(bodyResult.bodyScore || 0);
    });

    it('should apply 1.5x weight to subject scores', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'URGENT: Verify now!',
        body: 'Normal body text.'
      });
      
      // Get the base score for the same text
      const baseScore = textAnalyzer.analyzeText('URGENT: Verify now!');
      
      // Subject score should be 1.5x the base score
      expect(result.subjectScore).toBe(baseScore * 1.5);
    });
  });

  describe('analyzeText (individual)', () => {
    it('should analyze individual text content', () => {
      const score = textAnalyzer.analyzeText('URGENT: Your account will be suspended if you do not act immediately!');
      const patterns = textAnalyzer.getPatterns();
      expect(patterns).toContain('generic_urgency');
      expect(patterns).toContain('account_suspension_threat');
      expect(score).toBeGreaterThan(0);
    });

    it('should return same score for same content regardless of context', () => {
      const text = 'URGENT: Verify your account now!';
      const score1 = textAnalyzer.analyzeText(text);
      const patterns1 = textAnalyzer.getPatterns();
      const score2 = textAnalyzer.analyzeText(text);
      const patterns2 = textAnalyzer.getPatterns();
      
      expect(score1).toBe(score2);
      expect(patterns1).toEqual(patterns2);
    });

    it('should cap low severity pattern contributions', () => {
      // Create text with many low severity patterns
      const text = 'urgent verify confirm update validate secure protect immediately asap deadline limited time click here download install update now';
      
      const score = textAnalyzer.analyzeText(text);
      const patterns = textAnalyzer.getPatterns();
      
      // Should have some low severity patterns detected
      expect(patterns.length).toBeGreaterThan(2);
      
      // Should detect generic_urgency and generic_verification patterns
      expect(patterns).toContain('generic_urgency');
      expect(patterns).toContain('generic_verification');
      
      // But the score should be capped (low severity patterns contribute max 20 points)
      // Plus keyword density and punctuation penalties
      expect(score).toBeLessThan(50); // Reasonable cap considering all low severity patterns
    });
  });

  describe('getPhishingPatterns', () => {
    it('should return all phishing patterns', () => {
      const patterns = textAnalyzer.getPhishingPatterns();
      
      expect(patterns).toBeInstanceOf(Array);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]).toHaveProperty('name');
      expect(patterns[0]).toHaveProperty('pattern');
      expect(patterns[0]).toHaveProperty('severity');
      expect(patterns[0]).toHaveProperty('description');
    });
  });

  describe('getLegitimatePatterns', () => {
    it('should return all legitimate patterns', () => {
      const patterns = textAnalyzer.getLegitimatePatterns();
      
      expect(patterns).toBeInstanceOf(Array);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]).toHaveProperty('name');
      expect(patterns[0]).toHaveProperty('pattern');
      expect(patterns[0]).toHaveProperty('severity');
      expect(patterns[0]).toHaveProperty('description');
    });
  });

  describe('getSuspiciousKeywords', () => {
    it('should return all suspicious keywords', () => {
      const keywords = textAnalyzer.getSuspiciousKeywords();
      
      expect(keywords).toBeInstanceOf(Array);
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain('verify');
      expect(keywords).toContain('urgent');
      expect(keywords).toContain('suspended');
    });
  });

  describe('context detection', () => {
    it('should detect meeting context', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'Meeting Request',
        body: 'Let\'s schedule a conference call for tomorrow.'
      });
      
      expect(result.context).toBe('meeting');
    });

    it('should detect financial context', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'Invoice Payment',
        body: 'Please process the billing for this month.'
      });
      
      expect(result.context).toBe('financial');
    });

    it('should detect support context', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'Support Ticket',
        body: 'I need help with this issue.'
      });
      
      expect(result.context).toBe('support');
    });

    it('should detect newsletter context', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'Newsletter Update',
        body: 'Here are the latest news and announcements.'
      });
      
      expect(result.context).toBe('newsletter');
    });

    it('should default to general context', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'Random Subject',
        body: 'Random body content.'
      });
      
      expect(result.context).toBe('general');
    });
  });

  describe('false positive reduction', () => {
    it('should reduce score for legitimate business communications', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'Project Status Update',
        body: 'Please provide an update on the project deliverables and milestones.'
      });
      
      // Should have low score due to legitimate patterns providing negative scores
      expect(result.score).toBeLessThan(30);
    });

    it('should handle mixed legitimate and suspicious content', () => {
      const result = textAnalyzer.analyzeEmailText({
        subject: 'URGENT: Meeting Request',
        body: 'We need to schedule a meeting urgently to discuss the project status.'
      });
      
      // Should detect both patterns but legitimate context should reduce overall score
      expect(result.patterns).toContain('generic_urgency');
      expect(result.context).toBe('meeting');
    });
  });
});
