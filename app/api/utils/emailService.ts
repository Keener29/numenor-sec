import nodemailer from 'nodemailer';
import { tokenService } from './tokenService.js';

// Email configuration
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
};

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport(emailConfig);
};

// Email templates
export const emailTemplates = {
  permissionRequest: (businessName: string, emailAddress: string, businessEmail: string, emailId: number, businessId: number, approvalToken: string, declineToken: string) => ({
    subject: `Permission Request: Email Security Monitoring - ${businessName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Security Monitoring Permission Request</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
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
          
          <p><strong>${businessName}</strong> has requested permission to monitor the email address <strong>${emailAddress}</strong> for security threats and phishing attempts using the Numenor Security platform.</p>
          
          <div class="warning">
            <strong>⚠️ Important:</strong> This request is for legitimate business security purposes only. We will only monitor emails for potential security threats and will not access personal or confidential content.
          </div>
          
          <h3>What This Means:</h3>
          <ul>
            <li><strong>Security Monitoring:</strong> We will scan incoming emails for phishing attempts, malware, and other security threats</li>
            <li><strong>Threat Detection:</strong> Suspicious emails will be flagged and reported to ${businessName}'s security team</li>
            <li><strong>Privacy Protection:</strong> We do not read, store, or access the content of your emails beyond security scanning</li>
            <li><strong>Business Protection:</strong> This helps protect ${businessName} from cyber attacks and data breaches</li>
          </ul>
          
          <h3>Your Options:</h3>
          <p>You can choose to:</p>
          <ul>
            <li><strong>Grant Permission:</strong> Allow monitoring for security purposes</li>
            <li><strong>Deny Permission:</strong> Decline the monitoring request</li>
            <li><strong>Contact for Questions:</strong> Reach out to ${businessName} for more information</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <form method="POST" action="${process.env.API_BASE_URL || 'http://localhost:3001'}/api/emails/${emailId}/approve" style="display: inline-block; margin-right: 10px;">
              <input type="hidden" name="businessId" value="${businessId}">
              <input type="hidden" name="token" value="${approvalToken}">
              <button type="submit" class="button" style="background-color: #10b981; border: none; color: white; padding: 12px 24px; border-radius: 6px; cursor: pointer;"
                      onclick="return confirm('Are you sure you want to grant permission for ${businessName} to monitor ${emailAddress}?')">
                ✅ Grant Permission
              </button>
            </form>
            <form method="POST" action="${process.env.API_BASE_URL || 'http://localhost:3001'}/api/emails/${emailId}/decline" style="display: inline-block;">
              <input type="hidden" name="businessId" value="${businessId}">
              <input type="hidden" name="token" value="${declineToken}">
              <button type="submit" class="button" style="background-color: #dc2626; border: none; color: white; padding: 12px 24px; border-radius: 6px; cursor: pointer;"
                      onclick="return confirm('Are you sure you want to deny permission for ${businessName} to monitor ${emailAddress}? This will remove the email from monitoring.')">
                ❌ Deny Permission
              </button>
            </form>
          </div>
          
          <h3>Questions or Concerns?</h3>
          <p>If you have any questions about this request or need more information, please contact:</p>
          <ul>
            <li><strong>Business:</strong> ${businessName}</li>
            <li><strong>Email:</strong> ${businessEmail}</li>
          </ul>
          
          <div class="legal">
            <p><strong>Legal Notice:</strong> This email monitoring request is made in accordance with applicable privacy laws and regulations. By granting permission, you acknowledge that your email may be monitored for security purposes only. You may revoke this permission at any time by contacting the business directly. Numenor Security is committed to protecting your privacy and will only use your email data for legitimate security monitoring purposes.</p>
            
            <p><strong>Data Protection:</strong> All email monitoring activities are conducted in compliance with data protection regulations. We implement appropriate technical and organizational measures to ensure the security of your data.</p>
            
            <p><strong>Contact Information:</strong> For privacy-related questions or to exercise your data protection rights, please contact the business directly or email privacy@numenorsecurity.com</p>
          </div>
        </div>
        
        <div class="footer">
          <p>This email was sent by Numenor Security on behalf of ${businessName}</p>
          <p>© ${new Date().getFullYear()} Numenor Security. All rights reserved.</p>
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
- Threat Detection: Suspicious emails will be flagged and reported to ${businessName}'s security team
- Privacy Protection: We do not read, store, or access the content of your emails beyond security scanning
- Business Protection: This helps protect ${businessName} from cyber attacks and data breaches

Your Options:
You can choose to:
- Grant Permission: Allow monitoring for security purposes
- Deny Permission: Decline the monitoring request
- Contact for Questions: Reach out to ${businessName} for more information

To respond, please visit one of these secure links:
- Grant Permission: ${process.env.API_BASE_URL || 'http://localhost:3001'}/api/emails/${emailId}/approve (POST with businessId: ${businessId}, token: ${approvalToken})
- Deny Permission: ${process.env.API_BASE_URL || 'http://localhost:3001'}/api/emails/${emailId}/decline (POST with businessId: ${businessId}, token: ${declineToken})

Questions or Concerns?
If you have any questions about this request or need more information, please contact:
- Business: ${businessName}
- Email: ${businessEmail}

Legal Notice: This email monitoring request is made in accordance with applicable privacy laws and regulations. By granting permission, you acknowledge that your email may be monitored for security purposes only. You may revoke this permission at any time by contacting the business directly.

This email was sent by Numenor Security on behalf of ${businessName}
© ${new Date().getFullYear()} Numenor Security. All rights reserved.
    `
  })
};

// Email service functions
export const emailService = {
  async sendPermissionRequest(businessName: string, emailAddress: string, businessEmail: string, emailId: number, businessId: number): Promise<void> {
    try {
      const transporter = createTransporter();
      
      // Generate tokens once when sending the email
      const approvalToken = tokenService.generateApprovalToken(emailId, businessId);
      const declineToken = tokenService.generateDeclineToken(emailId, businessId);
      
      const template = emailTemplates.permissionRequest(businessName, emailAddress, businessEmail, emailId, businessId, approvalToken, declineToken);
      
      const mailOptions = {
        from: `"Numenor Security" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: emailAddress,
        subject: template.subject,
        html: template.html,
        text: template.text
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`Permission request email sent to ${emailAddress} for business ${businessName}`);
    } catch (error) {
      console.error('Failed to send permission request email:', error);
      throw new Error(`Failed to send permission request email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async testConnection(): Promise<boolean> {
    try {
      const transporter = createTransporter();
      await transporter.verify();
      console.log('Email service connection verified');
      return true;
    } catch (error) {
      console.error('Email service connection failed:', error);
      return false;
    }
  }
};
