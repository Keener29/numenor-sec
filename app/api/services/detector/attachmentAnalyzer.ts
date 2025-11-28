/**
 * Attachment Analyzer Service
 * Analyzes email attachments for security risks
 */

export interface PerFileAnalysis {
  filename: string;
  risks: string[];
  score: number;
}

export interface AttachmentAnalysis {
  risks: string[];
  score: number;
  suspiciousAttachments: PerFileAnalysis[];
  totalAttachments: number;
  isTrusted: boolean;
}

/**
 * Attachment Analyzer Service
 */
export class AttachmentAnalyzerService {
  private readonly rules = [
    { label: "Executable file", exts: ["exe", "scr", "bat", "cmd", "com", "pif"], score: 30 },
    { label: "Script file", exts: ["js", "vbs", "ps1", "sh"], score: 25 },
    { label: "Archive file", exts: ["zip", "rar", "7z", "tar", "gz"], score: 15 }
  ];

  /**
   * Analyze email attachments for security risks
   * @param attachments - Array of attachment filenames
   * @param isTrustedSender - Whether the sender is trusted (reduces risk scores)
   */
  analyzeAttachments(attachments: string[], isTrustedSender: boolean = false): AttachmentAnalysis {
    const suspiciousAttachments: PerFileAnalysis[] = [];
    const globalRisks: string[] = [];
    let totalScore = 0;

    for (const attachment of attachments) {
      const analysis = this.analyzeAttachment(attachment, isTrustedSender);
      if (analysis.risks.length > 0) {
        suspiciousAttachments.push(analysis);
        globalRisks.push(...analysis.risks);
        totalScore += analysis.score;
      }
    }

    return {
      risks: globalRisks,
      score: totalScore,
      suspiciousAttachments,
      totalAttachments: attachments.length,
      isTrusted: isTrustedSender
    };
  }
  /**
   * Analyze a single attachment
   * Handles:
   *  - multiple extensions (e.g., "invoice.pdf.exe")
   *  - unknown/no extension
   */
  private analyzeAttachment(filename: string, isTrusted: boolean): PerFileAnalysis {
    const lower = filename.toLowerCase();
    const parts = lower.split(".");
    const base = parts[0];
    const exts = parts.slice(1); // all extensions, supports double extensions

    const risks: string[] = [];
    let score = 0;

    // No extension case
    if (exts.length === 0) {
      risks.push("File with no extension");
      score += 10;
    }

    // Multi-extension detection (e.g. "pdf.js", "pdf.exe")
    for (const rule of this.rules) {
      const match = exts.some(e => rule.exts.includes(e));
      if (match) {
        risks.push(rule.label);
        score += isTrusted ? Math.floor(rule.score * 0.2) : rule.score;
      }
    }

    return {
      filename,
      risks,
      score
    };
  }

  /**
   * Generate recommendations based on attachment analysis
   */
  generateAttachmentRecommendations(analysis: AttachmentAnalysis): string[] {
    const recommendations: string[] = [];

    if (analysis.suspiciousAttachments.length > 0) {
      if (analysis.isTrusted) {
        recommendations.push(
          `WARNING: ${analysis.suspiciousAttachments.length} potentially risky attachment(s) from trusted sender - verify before opening`
        );
      } else {
        recommendations.push(
          `CRITICAL: ${analysis.suspiciousAttachments.length} suspicious attachment(s) detected - do not open`
        );
      }
    }

    if (analysis.risks.some(r => r.includes("Executable file"))) {
      recommendations.push("Do not open executable files unless absolutely verified.");
    }

    if (analysis.risks.some(r => r.includes("Script file"))) {
      recommendations.push("Script files can contain malicious code - verify sender before opening.");
    }

    if (analysis.risks.some(r => r.includes("Archive file"))) {
      recommendations.push("Archive files may hide malicious content - scan before extracting.");
    }

    if (analysis.risks.includes("File with no extension")) {
      recommendations.push("Files without extensions can be disguised malware - avoid opening.");
    }

    return recommendations;
  }
}

// Export singleton instance
export const attachmentAnalyzerService = new AttachmentAnalyzerService();
