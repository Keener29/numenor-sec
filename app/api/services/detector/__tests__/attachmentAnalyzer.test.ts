/**
 * Attachment Analyzer Service Tests
 * Tests for email attachment analysis functionality
 */

import { describe, expect, it } from '@jest/globals';
import { attachmentAnalyzerService, type AttachmentAnalysis } from '../attachmentAnalyzer.js';

describe('AttachmentAnalyzerService', () => {
  describe('analyzeAttachments', () => {
    it('should analyze multiple attachments and return combined results', async () => {
      const attachments = [
        'malware.exe',
        'suspicious.zip',
        'script.js',
        'document.pdf'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.totalAttachments).toBe(4);
      expect(result.suspiciousAttachments.length).toBe(3);
      expect(result.risks.length).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(0);
      expect(result.isTrusted).toBe(false);
    });

    it('should return empty results for empty attachment array', async () => {
      const result = attachmentAnalyzerService.analyzeAttachments([]);

      expect(result.totalAttachments).toBe(0);
      expect(result.suspiciousAttachments).toHaveLength(0);
      expect(result.risks).toHaveLength(0);
      expect(result.score).toBe(0);
      expect(result.isTrusted).toBe(false);
    });

    it('should detect executable files', async () => {
      const attachments = [
        'malware.exe',
        'virus.scr',
        'trojan.bat',
        'document.pdf'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.risks.some(risk => risk.includes('Executable file attachment'))).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.suspiciousAttachments.length).toBe(3);
    });

    it('should detect archive files', async () => {
      const attachments = [
        'suspicious.zip',
        'malware.rar',
        'virus.7z',
        'document.pdf'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.risks.some(risk => risk.includes('Archive file attachment'))).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.suspiciousAttachments.length).toBe(3);
    });

    it('should detect script files', async () => {
      const attachments = [
        'malicious.js',
        'virus.vbs',
        'trojan.ps1',
        'document.pdf'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.risks.some(risk => risk.includes('Script file attachment'))).toBe(true);
      expect(result.score).toBeGreaterThan(0);
      expect(result.suspiciousAttachments.length).toBe(3);
    });

    it('should detect multiple file types in same analysis', async () => {
      const attachments = [
        'malware.exe', // Executable
        'suspicious.zip', // Archive
        'script.js', // Script
        'document.pdf' // Safe
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.risks.some(risk => risk.includes('Executable file attachment'))).toBe(true);
      expect(result.risks.some(risk => risk.includes('Archive file attachment'))).toBe(true);
      expect(result.risks.some(risk => risk.includes('Script file attachment'))).toBe(true);
      expect(result.score).toBeGreaterThan(50); // Combined high score
      expect(result.suspiciousAttachments.length).toBe(3);
    });

    it('should handle safe file types without issues', async () => {
      const attachments = [
        'document.pdf',
        'image.jpg',
        'spreadsheet.xlsx',
        'presentation.pptx'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.suspiciousAttachments).toHaveLength(0);
      expect(result.risks).toHaveLength(0);
      expect(result.score).toBe(0);
    });

    it('should handle files without extensions', async () => {
      const attachments = [
        'suspicious_file',
        'document.pdf'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.suspiciousAttachments).toHaveLength(0);
      expect(result.risks).toHaveLength(0);
      expect(result.score).toBe(0);
    });

    it('should handle files with multiple dots', async () => {
      const attachments = [
        'malware.backup.exe',
        'script.min.js',
        'document.final.pdf'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.risks.some(risk => risk.includes('Executable file attachment'))).toBe(true);
      expect(result.risks.some(risk => risk.includes('Script file attachment'))).toBe(true);
      expect(result.suspiciousAttachments.length).toBe(2);
    });

    it('should be case insensitive', async () => {
      const attachments = [
        'MALWARE.EXE',
        'Script.JS',
        'SUSPICIOUS.ZIP'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.risks.some(risk => risk.includes('Executable file attachment'))).toBe(true);
      expect(result.risks.some(risk => risk.includes('Script file attachment'))).toBe(true);
      expect(result.risks.some(risk => risk.includes('Archive file attachment'))).toBe(true);
      expect(result.suspiciousAttachments.length).toBe(3);
    });

    it('should handle all executable extensions', async () => {
      const attachments = [
        'file.exe',
        'file.scr',
        'file.bat',
        'file.cmd',
        'file.com',
        'file.pif',
        'file.vbs',
        'file.js'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.risks.some(risk => risk.includes('Executable file attachment'))).toBe(true);
      expect(result.risks.some(risk => risk.includes('Script file attachment'))).toBe(true);
      expect(result.suspiciousAttachments.length).toBe(8);
      expect(result.score).toBeGreaterThan(200); // Some files are detected as both executable and script
    });

    it('should handle all archive extensions', async () => {
      const attachments = [
        'file.zip',
        'file.rar',
        'file.7z',
        'file.tar',
        'file.gz'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.risks.every(risk => risk.includes('Archive file attachment'))).toBe(true);
      expect(result.suspiciousAttachments.length).toBe(5);
      expect(result.score).toBe(75); // 5 * 15
    });

    it('should handle all script extensions', async () => {
      const attachments = [
        'file.js',
        'file.vbs',
        'file.ps1',
        'file.sh',
        'file.bat',
        'file.cmd'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.risks.some(risk => risk.includes('Script file attachment'))).toBe(true);
      expect(result.risks.some(risk => risk.includes('Executable file attachment'))).toBe(true);
      expect(result.suspiciousAttachments.length).toBe(6);
      expect(result.score).toBeGreaterThan(100); // Some files are detected as both executable and script
    });

    it('should reduce risk scores for trusted senders', async () => {
      const attachments = ['malware.exe', 'suspicious.zip'];

      const untrustedResult = attachmentAnalyzerService.analyzeAttachments(attachments, false);
      const trustedResult = attachmentAnalyzerService.analyzeAttachments(attachments, true);

      expect(trustedResult.score).toBeLessThan(untrustedResult.score);
      expect(trustedResult.isTrusted).toBe(true);
      expect(untrustedResult.isTrusted).toBe(false);
      
      // Trusted sender should have reduced scores
      expect(trustedResult.score).toBe(23); // 15 (exe) + 8 (zip)
      expect(untrustedResult.score).toBe(45); // 30 (exe) + 15 (zip)
    });

    it('should handle trusted sender with no suspicious attachments', async () => {
      const attachments = ['document.pdf', 'image.jpg'];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments, true);

      expect(result.totalAttachments).toBe(2);
      expect(result.suspiciousAttachments).toHaveLength(0);
      expect(result.risks).toHaveLength(0);
      expect(result.score).toBe(0);
      expect(result.isTrusted).toBe(true);
    });
  });

  describe('generateAttachmentRecommendations', () => {
    it('should generate recommendations for suspicious attachments', () => {
      const analysis: AttachmentAnalysis = {
        risks: ['Executable file attachment', 'Script file attachment'],
        score: 55,
        suspiciousAttachments: ['malware.exe', 'script.js'],
        totalAttachments: 2,
        isTrusted: false
      };

      const recommendations = attachmentAnalyzerService.generateAttachmentRecommendations(analysis);

      expect(recommendations).toContain('CRITICAL: 2 suspicious attachment(s) detected - do not open');
      expect(recommendations).toContain('Do not open executable files from unknown senders');
      expect(recommendations).toContain('Script files can contain malicious code - verify sender before opening');
    });

    it('should generate recommendations for executable files', () => {
      const analysis: AttachmentAnalysis = {
        risks: ['Executable file attachment'],
        score: 30,
        suspiciousAttachments: ['malware.exe'],
        totalAttachments: 1,
        isTrusted: false
      };

      const recommendations = attachmentAnalyzerService.generateAttachmentRecommendations(analysis);

      expect(recommendations).toContain('CRITICAL: 1 suspicious attachment(s) detected - do not open');
      expect(recommendations).toContain('Do not open executable files from unknown senders');
    });

    it('should generate recommendations for script files', () => {
      const analysis: AttachmentAnalysis = {
        risks: ['Script file attachment'],
        score: 25,
        suspiciousAttachments: ['script.js'],
        totalAttachments: 1,
        isTrusted: false
      };

      const recommendations = attachmentAnalyzerService.generateAttachmentRecommendations(analysis);

      expect(recommendations).toContain('CRITICAL: 1 suspicious attachment(s) detected - do not open');
      expect(recommendations).toContain('Script files can contain malicious code - verify sender before opening');
    });

    it('should generate recommendations for archive files', () => {
      const analysis: AttachmentAnalysis = {
        risks: ['Archive file attachment'],
        score: 15,
        suspiciousAttachments: ['suspicious.zip'],
        totalAttachments: 1,
        isTrusted: false
      };

      const recommendations = attachmentAnalyzerService.generateAttachmentRecommendations(analysis);

      expect(recommendations).toContain('CRITICAL: 1 suspicious attachment(s) detected - do not open');
      expect(recommendations).toContain('Archive files may contain malicious content - scan before extracting');
    });

    it('should return empty recommendations for clean analysis', () => {
      const analysis: AttachmentAnalysis = {
        risks: [],
        score: 0,
        suspiciousAttachments: [],
        totalAttachments: 3,
        isTrusted: false
      };

      const recommendations = attachmentAnalyzerService.generateAttachmentRecommendations(analysis);

      expect(recommendations).toHaveLength(0);
    });

    it('should generate multiple recommendations for complex analysis', () => {
      const analysis: AttachmentAnalysis = {
        risks: [
          'Executable file attachment',
          'Script file attachment',
          'Archive file attachment'
        ],
        score: 70,
        suspiciousAttachments: [
          'malware.exe',
          'script.js',
          'suspicious.zip'
        ],
        totalAttachments: 3,
        isTrusted: false
      };

      const recommendations = attachmentAnalyzerService.generateAttachmentRecommendations(analysis);

      expect(recommendations.length).toBeGreaterThan(3);
      expect(recommendations).toContain('CRITICAL: 3 suspicious attachment(s) detected - do not open');
      expect(recommendations).toContain('Do not open executable files from unknown senders');
      expect(recommendations).toContain('Script files can contain malicious code - verify sender before opening');
      expect(recommendations).toContain('Archive files may contain malicious content - scan before extracting');
    });

    it('should generate different recommendations for trusted vs untrusted senders', () => {
      const untrustedAnalysis: AttachmentAnalysis = {
        risks: ['Executable file attachment'],
        score: 30,
        suspiciousAttachments: ['malware.exe'],
        totalAttachments: 1,
        isTrusted: false
      };

      const trustedAnalysis: AttachmentAnalysis = {
        risks: ['Executable file attachment'],
        score: 15,
        suspiciousAttachments: ['malware.exe'],
        totalAttachments: 1,
        isTrusted: true
      };

      const untrustedRecommendations = attachmentAnalyzerService.generateAttachmentRecommendations(untrustedAnalysis);
      const trustedRecommendations = attachmentAnalyzerService.generateAttachmentRecommendations(trustedAnalysis);

      expect(untrustedRecommendations).toContain('CRITICAL: 1 suspicious attachment(s) detected - do not open');
      expect(trustedRecommendations).toContain('WARNING: 1 potentially risky attachment(s) from trusted sender - verify before opening');
    });
  });

  describe('edge cases', () => {
    it('should handle very long filenames', async () => {
      const longFilename = 'a'.repeat(1000) + '.exe';
      const attachments = [longFilename];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.totalAttachments).toBe(1);
      expect(result.risks.some(risk => risk.includes('Executable file attachment'))).toBe(true);
    });

    it('should handle filenames with special characters', async () => {
      const attachments = [
        'malware (1).exe',
        'script[1].js',
        'suspicious-file.zip',
        'document_file.pdf'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.totalAttachments).toBe(4);
      expect(result.suspiciousAttachments.length).toBe(3);
    });

    it('should handle filenames with spaces', async () => {
      const attachments = [
        'malware file.exe',
        'script file.js',
        'suspicious file.zip'
      ];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.totalAttachments).toBe(3);
      expect(result.suspiciousAttachments.length).toBe(3);
    });

    it('should handle empty filenames', async () => {
      const attachments = [''];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.totalAttachments).toBe(1);
      expect(result.suspiciousAttachments).toHaveLength(0);
      expect(result.score).toBe(0);
    });

    it('should handle filenames with only dots', async () => {
      const attachments = ['...', '..', '.'];

      const result = attachmentAnalyzerService.analyzeAttachments(attachments);

      expect(result.totalAttachments).toBe(3);
      expect(result.suspiciousAttachments).toHaveLength(0);
      expect(result.score).toBe(0);
    });
  });
});
