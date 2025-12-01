/**
 * Professional Email Service
 * Handles email sending with proper error handling, validation, and security
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { tokenService } from '../utils/tokenService.js';
import { emailLogger } from './logger.js';
import { ErrorFactory, ErrorCodes } from './errorHandler.js';
import type {
  EmailConfig,
  EmailTemplate,
  EmailSendResult,
  PermissionRequestParams,
  ThreatAlertParams,
  LogContext
} from '../types/email.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Get email configuration from environment variables
 */
function getEmailConfig(): EmailConfig {
  const host = process.env.SMTP_HOST;
  const port = Number.parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw ErrorFactory.emailService(
      ErrorCodes.EMAIL_SERVICE_NOT_CONFIGURED,
      'Email service not configured. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.',
      500
    );
  }

  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user,
      pass
    },
    tls: {
      rejectUnauthorized: false
    },
    timeouts: {
      connection: 60000, // 60 seconds
      greeting: 30000,   // 30 seconds
      socket: 60000      // 60 seconds
    }
  };
}

/**
 * Create nodemailer transporter with proper configuration
 */
export function createTransporter(): Transporter {
  const config = getEmailConfig();

  const nodemailerConfig = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    tls: config.tls,
    connectionTimeout: config.timeouts.connection,
    greetingTimeout: config.timeouts.greeting,
    socketTimeout: config.timeouts.socket
  };

  emailLogger.debug('Creating email transporter', {
    operation: 'create-transporter',
    metadata: {
      host: config.host,
      port: config.port,
      secure: config.secure,
      userLength: config.auth.user.length
    }
  });

  return nodemailer.createTransport(nodemailerConfig);
}

// =============================================================================
// EMAIL TEMPLATES
// =============================================================================

/**
 * Generate permission request email template
 */
export function generatePermissionRequestTemplate(params: PermissionRequestParams): EmailTemplate {
  const {
    businessName,
    emailAddress,
    businessEmail,
    businessId,
    approvalToken
  } = params;

  const apiUrl = process.env.VITE_API_URL;
  const currentYear = new Date().getFullYear();
  let subject = "Permission Request: Email Security Monitoring";
  let businessNameDisplay = businessName;
  if (businessName) {
    subject += ` - ${businessName}`;
  } else {
    businessNameDisplay = 'the business';
  }

  return {
    subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Security Monitoring Permission Request</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1f2937; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
          .button { display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
          .button:hover { background-color: #2563eb; }
          .warning { background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 20px 0; }
          .legal { font-size: 11px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🔒 Email Security Monitoring Request</h1>
          <p>Numenor Security Platform</p>
        </div>
        
        <div class="content">
          <h2>Permission Request for Email Monitoring</h2>
          
          <p>Dear Email Account Holder,</p>
          
          <p><strong>${businessNameDisplay}</strong> has requested permission to monitor the email address <strong>${emailAddress}</strong> for security threats and phishing attempts using the Numenor Security platform.</p>
          
          <div class="warning">
            <strong>⚠️ Important:</strong> This request is for legitimate business security purposes only. We will only monitor emails for potential security threats and will not access personal or confidential content.
          </div>
          
          <h3>What This Means:</h3>
          <ul>
            <li><strong>Security Monitoring:</strong> We will scan incoming emails for phishing attempts, malware, and other security threats</li>
            <li><strong>Threat Detection:</strong> Suspicious emails will be flagged and reported to ${businessNameDisplay}'s team</li>
            <li><strong>Privacy Protection:</strong> We do not read, store, or access the content of your emails beyond security scanning</li>
            <li><strong>Business Protection:</strong> This helps protect ${businessNameDisplay} from cyber attacks and data breaches</li>
          </ul>
          
          <h3>Your Options:</h3>
          <p>You can choose to:</p>
          <ul>
            <li><strong>Grant Permission:</strong> Allow monitoring for security purposes</li>
            <li><strong>Deny Permission:</strong> Decline the monitoring request</li>
            <li><strong>Contact for Questions:</strong> Reach out to ${businessNameDisplay} for more information</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${apiUrl}/oauth/gmail/auth-url?emailAddress=${encodeURIComponent(emailAddress)}&businessId=${businessId}&approveToken=${approvalToken}" 
               class="button" style="background-color: #10b981; border: none; color: white; padding: 12px 24px; border-radius: 6px; cursor: pointer; text-decoration: none; display: inline-block; margin-right: 10px;">
              ✅ Grant Permission
            </a>
          </div>
          
          <h3>Questions or Concerns?</h3>
          <p>If you have any questions about this request or need more information, please contact:</p>
          <ul>
            <li><strong>Business:</strong> ${businessNameDisplay}</li>
            <li><strong>Email:</strong> ${businessEmail}</li>
          </ul>
          
          <div class="legal">
            <p><strong>Legal Notice:</strong> This email monitoring request is made in accordance with applicable privacy laws and regulations. By granting permission, you acknowledge that your email may be monitored for security purposes only. You may revoke this permission at any time by contacting the business directly. Numenor Security is committed to protecting your privacy and will only use your email data for legitimate security monitoring purposes.</p>
            
            <p><strong>Data Protection:</strong> All email monitoring activities are conducted in compliance with data protection regulations. We implement appropriate technical and organizational measures to ensure the security of your data.</p>
            
            <p><strong>Contact Information:</strong> For privacy-related questions or to exercise your data protection rights, please contact the business directly or email privacy@numenorsecurity.com</p>
          </div>
        </div>
        
        <div class="footer">
          <p>This email was sent by Numenor Security on behalf of ${businessNameDisplay}</p>
          <p>© ${currentYear} Numenor Security. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
    text: `
Email Security Monitoring Permission Request

Dear Email Account Holder,

${businessName} has requested permission to monitor the email address ${emailAddress} for security threats and phishing attempts using the Numenor Security platform.

IMPORTANT: This request is for legitimate business security purposes only. We will only monitor emails for potential security threats and will not access personal or confidential content.

What This Means:
- Security Monitoring: We will scan incoming emails for phishing attempts, malware, and other security threats
- Threat Detection: Suspicious emails will be flagged and reported to ${businessNameDisplay}'s team
- Privacy Protection: We do not read, store, or access the content of your emails beyond security scanning
- Business Protection: This helps protect ${businessNameDisplay} from cyber attacks and data breaches

Your Options:
You can choose to:
- Grant Permission: Allow monitoring for security purposes
- Deny Permission: Decline the monitoring request
- Contact for Questions: Reach out to ${businessNameDisplay} for more information

To accept, please visit the secure link:
- Grant Permission: ${apiUrl}/oauth/gmail/auth-url?emailAddress=${encodeURIComponent(emailAddress)}&businessId=${businessId}&approveToken=${approvalToken}

Questions or Concerns?
If you have any questions about this request or need more information, please contact:
- Business: ${businessNameDisplay}
- Email: ${businessEmail}

Legal Notice: This email monitoring request is made in accordance with applicable privacy laws and regulations. By granting permission, you acknowledge that your email may be monitored for security purposes only. You may revoke this permission at any time by contacting the business directly.

This email was sent by Numenor Security on behalf of ${businessNameDisplay}
© ${currentYear} Numenor Security. All rights reserved.
    `
  };
}

/**
 * Generate threat alert email template
 */
export function generateThreatAlertTemplate(params: ThreatAlertParams): EmailTemplate {
  const { businessName, monitoredEmail, emailMessage, threatAssessment } = params;

  const threatLevelColors = {
    high: '#dc2626',
    critical: '#991b1b',
    medium: '#d97706',
    low: '#059669'
  };

  const threatLevelIcons = {
    high: '🚨',
    critical: '🔥',
    medium: '⚠️',
    low: 'ℹ️'
  };

  const color = threatLevelColors[threatAssessment.threatLevel] || '#6b7280';
  const icon = threatLevelIcons[threatAssessment.threatLevel] || '⚠️';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const currentYear = new Date().getFullYear();

  return {
    subject: `${icon} SECURITY ALERT: ${threatAssessment.threatLevel.toUpperCase()} Threat Detected - ${businessName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Security Threat Alert</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${color}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .alert-box { background-color: #fef2f2; border: 2px solid ${color}; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .threat-info { background-color: #ffffff; border: 1px solid #e5e7eb; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .recommendations { background-color: #f0f9ff; border: 1px solid #0ea5e9; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
          .button { display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
          .button:hover { background-color: #2563eb; }
          .badge { display: inline-block; background-color: ${color}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${icon} SECURITY THREAT DETECTED</h1>
          <p>Numenor Security Platform</p>
        </div>
        
        <div class="content">
          <div class="alert-box">
            <h2>🚨 IMMEDIATE ATTENTION REQUIRED</h2>
            <p>A <strong>${threatAssessment.threatLevel.toUpperCase()}</strong> level security threat has been detected in your monitored email system.</p>
          </div>
          
          <h3>Threat Details</h3>
          <div class="threat-info">
            <p><strong>Monitored Email:</strong> ${monitoredEmail}</p>
            <p><strong>Threat Level:</strong> <span class="badge">${threatAssessment.threatLevel.toUpperCase()}</span></p>
            <p><strong>Confidence Score:</strong> ${threatAssessment.confidence}%</p>
            <p><strong>Detected At:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <h3>Suspicious Email Details</h3>
          <div class="threat-info">
            <p><strong>Subject:</strong> ${emailMessage.subject}</p>
            <p><strong>From:</strong> ${emailMessage.sender.address}</p>
            <p><strong>To:</strong> ${emailMessage.recipient.address}</p>
            <p><strong>Received:</strong> ${new Date(emailMessage.timestamp).toLocaleString()}</p>
          </div>
          
          <h3>Detected Threat Patterns</h3>
          <div class="threat-info">
            <ul>
              ${threatAssessment.detectedPatterns.map((pattern: string) => `<li>${pattern.replaceAll('_', ' ').toUpperCase()}</li>`).join('')}
            </ul>
          </div>
          
          <h3>Risk Factors</h3>
          <div class="threat-info">
            <ul>
              ${threatAssessment.riskFactors.map((risk: string) => `<li>${risk}</li>`).join('')}
            </ul>
          </div>
          
          <h3>Recommended Actions</h3>
          <div class="recommendations">
            <ul>
              ${threatAssessment.recommendations.map((rec: string) => `<li>${rec}</li>`).join('')}
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${frontendUrl}/dashboard" class="button" style="color: white;">
              View Dashboard
            </a>
            <a href="${frontendUrl}/dashboard" class="button" style="background-color: #dc2626; color: white;">
              Manage Alerts
            </a>
          </div>

          
          <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <strong>⚠️ Important:</strong> Do not click any links or download attachments from the suspicious email. If you have already interacted with the email, contact your IT security team or Numenor Security immediately.
          </div>
        </div>
        
        <div class="footer">
          <p>This alert was generated by Numenor Security for ${businessName}</p>
          <p>© ${currentYear} Numenor Security. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
    text: `
SECURITY THREAT ALERT - ${threatAssessment.threatLevel.toUpperCase()} LEVEL

A ${threatAssessment.threatLevel.toUpperCase()} level security threat has been detected in your monitored email system.

THREAT DETAILS:
- Monitored Email: ${monitoredEmail}
- Threat Level: ${threatAssessment.threatLevel.toUpperCase()}
- Confidence Score: ${threatAssessment.confidence}%
- Detected At: ${new Date().toLocaleString()}

SUSPICIOUS EMAIL DETAILS:
- Subject: ${emailMessage.subject}
- From: ${emailMessage.sender.address}
- To: ${emailMessage.recipient.address}
- Received: ${new Date(emailMessage.timestamp).toLocaleString()}

DETECTED THREAT PATTERNS:
${threatAssessment.detectedPatterns.map((pattern: string) => `- ${pattern.replaceAll('_', ' ').toUpperCase()}`).join('\n')}

RISK FACTORS:
${threatAssessment.riskFactors.map((risk: string) => `- ${risk}`).join('\n')}

RECOMMENDED ACTIONS:
${threatAssessment.recommendations.map((rec: string) => `- ${rec}`).join('\n')}

IMPORTANT: Do not click any links or download attachments from the suspicious email. If you have already interacted with the email, contact your IT security team or Numenor Security immediately.

View your dashboard: ${frontendUrl}/dashboard

This alert was generated by Numenor Security for ${businessName}
© ${currentYear} Numenor Security. All rights reserved.
    `
  };
}

/**
 * Generate password reset email template
 */
export function generatePasswordResetTemplate(params: { recipientEmail: string; resetLink: string }): EmailTemplate {
  const { recipientEmail, resetLink } = params;
  const appName = 'Numenor Security';
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@numenorsecurity.com';
  const currentYear = new Date().getFullYear();
  const expiresText = 'This link expires in 1 hour for your security.';

  return {
    subject: `Reset your ${appName} password`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #111827; max-width: 640px; margin: 0 auto; padding: 24px; background: #0b1220; }
          .card { background: #0f172a; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          .header { background: linear-gradient(135deg, #0ea5e9, #3b82f6 60%, #6366f1); padding: 28px; color: white; text-align: center; }
          .brand { font-size: 20px; letter-spacing: 0.4px; opacity: 0.95; }
          .content { padding: 28px; color: #e5e7eb; }
          .muted { color: #94a3b8; }
          .code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; background: #0b1220; border: 1px solid #1f2937; border-radius: 8px; padding: 10px 14px; display: inline-block; color: #e2e8f0; }
          .cta { text-align: center; margin: 28px 0; }
          .button { display: inline-block; background: linear-gradient(135deg, #22c55e, #16a34a); color: white; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: 600; box-shadow: 0 8px 20px rgba(34,197,94,0.3); }
          .button:hover { filter: brightness(1.05); }
          .divider { height: 1px; background: linear-gradient(90deg, transparent, #1f2937, transparent); margin: 24px 0; }
          .foot { text-align: center; padding: 18px 24px; color: #94a3b8; font-size: 12px; }
          .warning { background: rgba(251, 191, 36, 0.08); border: 1px solid rgba(245, 158, 11, 0.35); padding: 14px; border-radius: 10px; margin-top: 8px; color: #fbbf24; }
          .tip { background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.35); padding: 12px; border-radius: 10px; color: #c7d2fe; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div class="brand">${appName}</div>
            <h1 style="margin: 8px 0 0; font-size: 24px;">Password Reset</h1>
          </div>
          <div class="content">
            <p>We received a request to reset the password for your account <span class="code">${recipientEmail}</span>.</p>
            <div class="cta">
              <a class="button" href="${resetLink}">Reset your password</a>
            </div>
            <p class="muted">${expiresText}</p>
            <div class="divider"></div>
            <div class="tip">
              If you did not request this change, you can safely ignore this email. Your password will remain unchanged.
            </div>
            <p style="margin-top: 14px;" class="muted">For your security, this link can only be used once.</p>
            <div class="warning">
              Never share this email or your reset link. ${appName} support will never ask for it.
            </div>
          </div>
          <div class="foot">
            <div>&copy; ${currentYear} ${appName}. All rights reserved.</div>
            <div>Need help? Contact <a style="color:#93c5fd" href="mailto:${supportEmail}">${supportEmail}</a></div>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
${appName} - Password Reset

We received a request to reset the password for your account (${recipientEmail}).

Reset your password: ${resetLink}

${expiresText}

If you did not request this change, you can ignore this email. Your password will remain unchanged.

Never share this email or your reset link. ${appName} support will never ask for it.

© ${currentYear} ${appName}. All rights reserved. Need help? ${supportEmail}
    `
  };
}

// =============================================================================
// EMAIL SERVICE CLASS
// =============================================================================

class EmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig | null = null;

  constructor() {
    this.initializeService();
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(recipientEmail: string, resetLink: string): Promise<EmailSendResult> {
    const context: LogContext = {
      operation: 'send-password-reset',
      emailAddress: recipientEmail
    };

    try {
      emailLogger.info('Sending password reset email', context);

      if (!this.transporter || !this.config) {
        emailLogger.warn('SMTP not configured - skipping password reset email', context);
        return {
          success: false,
          error: 'Email service not configured',
          timestamp: new Date()
        };
      }

      const template = generatePasswordResetTemplate({
        recipientEmail,
        resetLink
      });

      const fromAddress = process.env.SMTP_FROM || this.config.auth.user;
      const mailOptions = {
        from: `"Numenor Security" <${fromAddress}>`,
        to: recipientEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      };

      const result = await this.transporter.sendMail(mailOptions);

      emailLogger.info('Password reset email sent successfully', {
        ...context,
        metadata: {
          messageId: result.messageId
        }
      });

      return {
        success: true,
        messageId: result.messageId,
        timestamp: new Date()
      };
    } catch (error) {
      emailLogger.error('Failed to send password reset email', context, error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  /**
   * Initialize the email service
   */
  private initializeService(): void {
    try {
      this.config = getEmailConfig();
      this.transporter = createTransporter();

      emailLogger.info('Email service initialized successfully', {
        operation: 'initialize-service',
        metadata: {
          host: this.config.host,
          port: this.config.port,
          secure: this.config.secure
        }
      });
    } catch (error) {
      emailLogger.error('Failed to initialize email service', {
        operation: 'initialize-service'
      }, error as Error);
      throw error;
    }
  }

  /**
   * Send permission request email
   */
  async sendPermissionRequest(
    businessName: string,
    emailAddress: string,
    businessEmail: string,
    emailId: number,
    businessId: number
  ): Promise<EmailSendResult> {
    const context: LogContext = {
      operation: 'send-permission-request',
      businessId,
      emailAddress,
      metadata: {
        emailId,
        businessName,
        businessEmail
      }
    };

    try {
      emailLogger.info('Sending permission request email', context);

      if (!this.transporter || !this.config) {
        throw ErrorFactory.emailService(
          ErrorCodes.EMAIL_SERVICE_NOT_CONFIGURED,
          'Email service not properly initialized'
        );
      }

      // Generate secure tokens
      const approvalToken = tokenService.generateApprovalToken(emailId, businessId);

      // Generate email template
      const template = generatePermissionRequestTemplate({
        businessName,
        emailAddress,
        businessEmail,
        businessId,
        approvalToken
      });

      // Prepare mail options
      const fromAddress = process.env.SMTP_FROM || this.config.auth.user;
      const mailOptions = {
        from: `"Numenor Security" <${fromAddress}>`,
        to: emailAddress,
        subject: template.subject,
        html: template.html,
        text: template.text
      };

      // Send email
      const result = await this.transporter.sendMail(mailOptions);

      emailLogger.info('Permission request email sent successfully', {
        ...context,
        metadata: {
          ...context.metadata,
          messageId: result.messageId
        }
      });

      return {
        success: true,
        messageId: result.messageId,
        timestamp: new Date()
      };

    } catch (error) {
      emailLogger.error('Failed to send permission request email', context, error as Error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  /**
   * Send threat alert email
   */
  async sendThreatAlert(
    businessName: string,
    ownerEmail: string,
    monitoredEmail: string,
    emailMessage: any,
    threatAssessment: any
  ): Promise<EmailSendResult> {
    const context: LogContext = {
      operation: 'send-threat-alert',
      emailAddress: monitoredEmail,
      metadata: {
        businessName,
        ownerEmail,
        threatLevel: threatAssessment.threatLevel,
        confidence: threatAssessment.confidence
      }
    };

    try {
      emailLogger.info('Sending threat alert email', context);

      if (!this.transporter || !this.config) {
        emailLogger.warn('SMTP not configured - skipping threat alert email', context);
        return {
          success: false,
          error: 'Email service not configured',
          timestamp: new Date()
        };
      }

      const template = generateThreatAlertTemplate({
        businessName,
        ownerEmail,
        monitoredEmail,
        emailMessage,
        threatAssessment
      });

      const fromAddress = process.env.SMTP_FROM || this.config.auth.user;
      const mailOptions = {
        from: `${fromAddress}`,
        to: ownerEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      };

      const result = await this.transporter.sendMail(mailOptions);

      emailLogger.info('Threat alert email sent successfully', {
        ...context,
        metadata: {
          ...context.metadata,
          messageId: result.messageId
        }
      });

      return {
        success: true,
        messageId: result.messageId,
        timestamp: new Date()
      };

    } catch (error) {
      emailLogger.error('Failed to send threat alert email', context, error as Error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  /**
   * Test email service connection
   */
  async testConnection(): Promise<boolean> {
    const context: LogContext = {
      operation: 'test-connection'
    };

    try {
      if (!this.transporter) {
        throw ErrorFactory.emailService(
          ErrorCodes.EMAIL_SERVICE_NOT_CONFIGURED,
          'Email service not initialized'
        );
      }

      await this.transporter.verify();

      emailLogger.info('Email service connection verified', context);
      return true;
    } catch (error) {
      emailLogger.error('Email service connection failed', context, error as Error);
      return false;
    }
  }

  /**
   * Get service configuration (without sensitive data)
   */
  getConfig(): Omit<EmailConfig, 'auth'> | null {
    if (!this.config) return null;

    return {
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      tls: this.config.tls,
      timeouts: this.config.timeouts
    };
  }

  /**
   * Reinitialize service (useful for config changes)
   */
  reinitialize(): void {
    this.transporter = null;
    this.config = null;
    this.initializeService();
  }
}

// Export singleton instance
export const emailService = new EmailService();
