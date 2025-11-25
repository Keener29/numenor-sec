/**
 * Attachment Analyzer Service
 * Analyzes email attachments for security risks
 */

export interface AttachmentAnalysis {
  risks: string[];
  score: number;
  suspiciousAttachments: string[];
  totalAttachments: number;
  isTrusted: boolean;
}

/**
 * Attachment Analyzer Service
 */
export class AttachmentAnalyzerService {
  private readonly executableExtensions = ['exe', 'scr', 'bat', 'cmd', 'com', 'pif', 'vbs', 'js'];
  private readonly archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz'];
  private readonly scriptExtensions = ['js', 'vbs', 'ps1', 'sh', 'bat', 'cmd'];

  /**
   * Analyze email attachments for security risks
   * @param attachments - Array of attachment filenames
   * @param isTrustedSender - Whether the sender is trusted (reduces risk scores)
   */
  analyzeAttachments(attachments: string[], isTrustedSender: boolean = false): AttachmentAnalysis {
    const risks: string[] = [];
    const suspiciousAttachments: string[] = [];
    let score = 0;

    for (const attachment of attachments) {
      const extension = this.getFileExtension(attachment);
      const attachmentRisks: string[] = [];
      let attachmentScore = 0;
      const executableScore = this.isExecutableFile(extension, isTrustedSender);
      const archiveScore = this.isArchiveFile(extension, isTrustedSender);
      const scriptScore = this.isScriptFile(extension, isTrustedSender);
      if (executableScore > 0) {
        attachmentRisks.push('Executable file attachment');
        attachmentScore += executableScore;
      }

      if (archiveScore > 0) {
        attachmentRisks.push('Archive file attachment');
        attachmentScore += archiveScore;
      }

      if (scriptScore > 0) {
        attachmentRisks.push('Script file attachment');
        attachmentScore += scriptScore;
      }

      if (attachmentRisks.length > 0) {
        suspiciousAttachments.push(attachment);
        risks.push(...attachmentRisks);
        score += attachmentScore;
      }
    }

    return {
      risks,
      score,
      suspiciousAttachments,
      totalAttachments: attachments.length,
      isTrusted: isTrustedSender
    };
  }

  /**
   * Generate recommendations based on attachment analysis
   */
  generateAttachmentRecommendations(analysis: AttachmentAnalysis): string[] {
    const recommendations: string[] = [];

    if (analysis.suspiciousAttachments.length > 0) {
      if (analysis.isTrusted) {
        recommendations.push(`WARNING: ${analysis.suspiciousAttachments.length} potentially risky attachment(s) from trusted sender - verify before opening`);
      } else {
        recommendations.push(`CRITICAL: ${analysis.suspiciousAttachments.length} suspicious attachment(s) detected - do not open`);
      }
    }

    if (analysis.risks.some(risk => risk.includes('Executable file attachment'))) {
      recommendations.push('Do not open executable files from unknown senders');
    }

    if (analysis.risks.some(risk => risk.includes('Script file attachment'))) {
      recommendations.push('Script files can contain malicious code - verify sender before opening');
    }

    if (analysis.risks.some(risk => risk.includes('Archive file attachment'))) {
      recommendations.push('Archive files may contain malicious content - scan before extracting');
    }

    return recommendations;
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string | undefined {
    return filename.split('.').pop()?.toLowerCase();
  }

  /**
   * Check if file extension is executable
   */
  private isExecutableFile(extension?: string, isTrustedSender: boolean = false): number {
    const isExecutable = extension ? this.executableExtensions.includes(extension) : false;
    if (!isExecutable) return 0;
    return isTrustedSender ? 15 : 30;
  }

  /**
   * Check if file extension is archive
   */
  private isArchiveFile(extension?: string, isTrustedSender: boolean = false): number {
    const isArchive = extension ? this.archiveExtensions.includes(extension) : false;
    if (!isArchive) return 0;
    return isTrustedSender ? 8 : 15;
  }

  /**
   * Check if file extension is script
   */
  private isScriptFile(extension?: string, isTrustedSender: boolean = false): number {
    const isScript = extension ? this.scriptExtensions.includes(extension) : false;
    if (!isScript) return 0;
    return isTrustedSender ? 12 : 25;
  }
}

// Export singleton instance
export const attachmentAnalyzerService = new AttachmentAnalyzerService();
