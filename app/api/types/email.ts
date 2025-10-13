/**
 * Email and OAuth Type Definitions
 * Professional TypeScript interfaces for email and OAuth services
 */

// Import authentication types from email auth detector
import type { 
  AuthenticationResults,
  SPFResult,
  DKIMResult,
  DMARCResult,
  OverallAuthResult
} from '../services/detector/emailAuthDetector.js';

// Re-export authentication types
export type { 
  AuthenticationResults,
  SPFResult,
  DKIMResult,
  DMARCResult,
  OverallAuthResult
};

// =============================================================================
// CORE EMAIL TYPES
// =============================================================================

export interface EmailAddress {
  readonly address: string;
  readonly name?: string;
}

export interface EmailMessage {
  readonly id: string;
  readonly subject: string;
  readonly body: string;
  readonly sender: EmailAddress;
  readonly recipient: EmailAddress;
  readonly timestamp: Date;
  readonly attachments?: EmailAttachment[];
  readonly links?: string[];
  readonly headers: Record<string, string>;
  readonly threadId?: string;
  readonly labels?: string[];
}

export interface EmailAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly contentId?: string;
}

export interface MonitoredEmail {
  readonly id: number;
  readonly businessId: number;
  readonly emailAddress: string;
  readonly isConnected: boolean;
  readonly lastChecked: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// =============================================================================
// OAUTH TYPES
// =============================================================================

export interface OAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly scope: string;
  readonly tokenType: string;
  readonly expiryDate: Date;
}

export interface OAuthState {
  readonly businessId: number;
  readonly emailAddress: string;
  readonly nonce: string;
  readonly timestamp: number;
}

export interface OAuthConnectionStatus {
  readonly isConnected: boolean;
  readonly connectedAt: Date | null;
  readonly provider: 'gmail' | 'outlook' | 'yahoo';
  readonly lastSyncAt?: Date;
  readonly tokenExpiry?: Date;
}

// =============================================================================
// EMAIL SERVICE TYPES
// =============================================================================

export interface EmailTemplate {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface EmailConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly auth: {
    readonly user: string;
    readonly pass: string;
  };
  readonly tls: {
    readonly rejectUnauthorized: boolean;
  };
  readonly timeouts: {
    readonly connection: number;
    readonly greeting: number;
    readonly socket: number;
  };
}

export interface EmailSendResult {
  readonly success: boolean;
  readonly messageId?: string;
  readonly error?: string;
  readonly timestamp: Date;
}

// =============================================================================
// GMAIL API TYPES
// =============================================================================
// Note: Gmail-specific types have been moved to app/api/services/oauth/gmail/types.ts

// =============================================================================
// SECURITY TYPES
// =============================================================================

export interface SecurityToken {
  readonly token: string;
  readonly type: 'approval' | 'decline';
  readonly emailId: number;
  readonly businessId: number;
  readonly expiresAt: Date;
  readonly nonce: string;
}

export interface SecurityEvent {
  readonly id?: number;
  readonly businessId: number;
  readonly eventType: SecurityEventType;
  readonly description: string;
  readonly metadata?: Record<string, unknown>;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly timestamp: Date;
}

export type SecurityEventType = 
  | 'email_approved'
  | 'email_declined'
  | 'permission_email_sent'
  | 'permission_email_failed'
  | 'permission_email_resent'
  | 'permission_email_resend_failed'
  | 'email_updated'
  | 'email_deleted'
  | 'oauth_connected'
  | 'oauth_disconnected'
  | 'oauth_failed'
  | 'phishing_detected'
  | 'email_scan_completed'
  | 'email_scan_failed';

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

export interface AddEmailRequest {
  readonly emailAddress: string;
}

export interface UpdateEmailRequest {
  readonly emailAddress?: string;
  readonly isConnected?: boolean;
}

export interface EmailListResponse {
  readonly emails: MonitoredEmail[];
  readonly pagination: PaginationInfo;
}

export interface PaginationInfo {
  readonly page: number;
  readonly limit: number;
  readonly totalCount: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
}

export interface EmailStatsResponse {
  readonly stats: {
    readonly totalEmails: number;
    readonly connectedEmails: number;
    readonly disconnectedEmails: number;
    readonly recentActivity: number;
  };
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class EmailServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'EmailServiceError';
  }
}

export class OAuthServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OAuthServiceError';
  }
}

export class TokenValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 403
  ) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

export interface EmailServiceConfig {
  readonly smtp: EmailConfig;
  readonly templates: {
    readonly permissionRequest: (params: PermissionRequestParams) => EmailTemplate;
    readonly threatAlert: (params: ThreatAlertParams) => EmailTemplate;
  };
  readonly rateLimiting: {
    readonly maxEmailsPerHour: number;
    readonly maxEmailsPerDay: number;
  };
}

export interface PermissionRequestParams {
  readonly businessName: string;
  readonly emailAddress: string;
  readonly businessEmail: string;
  readonly emailId: number;
  readonly businessId: number;
  readonly approvalToken: string;
  readonly declineToken: string;
}

export interface ThreatAlertParams {
  readonly businessName: string;
  readonly ownerEmail: string;
  readonly monitoredEmail: string;
  readonly emailMessage: EmailMessage;
  readonly threatAssessment: ThreatAssessment;
}

export interface ThreatAssessment {
  readonly threatLevel: 'low' | 'medium' | 'high' | 'critical';
  readonly confidence: number;
  readonly detectedPatterns: string[];
  readonly riskFactors: string[];
  readonly recommendations: string[];
  readonly authenticationResults?: AuthenticationResults;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type EmailProvider = 'gmail' | 'outlook' | 'yahoo' | 'custom';

export interface EmailProviderConfig {
  readonly provider: EmailProvider;
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly authRequired: boolean;
}

export interface LogContext {
  readonly requestId?: string;
  readonly userId?: number;
  readonly businessId?: number;
  readonly emailAddress?: string;
  readonly operation: string;
  readonly metadata?: Record<string, unknown>;
}
