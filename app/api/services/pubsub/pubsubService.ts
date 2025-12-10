/**
 * Google Cloud Pub/Sub Service
 * Handles Pub/Sub topic and subscription management for Gmail push notifications
 */

import { PubSub } from '@google-cloud/pubsub';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { monitoringLogger } from '../../../utils/logger.js';
import { ErrorFactory, ErrorCodes } from '../errorHandler.js';

class PubSubService {
  private pubsub: PubSub | null = null;
  private topicName: string;
  private subscriptionName: string;
  private webhookUrl: string;
  private projectId?: string;

  constructor() {
    this.topicName = process.env.GMAIL_PUBSUB_TOPIC || 'gmail-notifications';
    this.subscriptionName = process.env.GMAIL_PUBSUB_SUBSCRIPTION || 'gmail-notify-sub';
    
    // Store project ID explicitly to ensure consistency
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    
    // Webhook URL for push subscription
    const baseUrl = process.env.PUBSUB_WEBHOOK_URL || process.env.VITE_API_URL;
    if (!baseUrl) {
      monitoringLogger.error('PUBSUB_WEBHOOK_URL not set. Pub/Sub notifications will not work.', {
        operation: 'pubsub-initialize',
        metadata: {
          note: 'Set PUBSUB_WEBHOOK_URL environment variable to your public API URL (e.g., ngrok URL)'
        }
      });
      this.webhookUrl = '';
    } else {
      this.webhookUrl = `${baseUrl}/api/gmail-notify`;
    }

    this.initialize();
  }

  private initialize(): void {
    try {
      // Initialize Pub/Sub client
      // Uses Application Default Credentials (ADC) or GOOGLE_APPLICATION_CREDENTIALS env var
      this.pubsub = new PubSub({
        projectId: this.projectId
      });

      const isNgrok = this.webhookUrl.includes('ngrok');
      const logLevel = isNgrok ? 'warn' : 'info';
      const logMessage = isNgrok 
        ? 'Pub/Sub service initialized (ngrok detected - ensure Pub/Sub subscription push endpoint matches)'
        : 'Pub/Sub service initialized';

      monitoringLogger[logLevel](logMessage, {
        operation: 'pubsub-initialize',
        metadata: {
          topicName: this.topicName,
          subscriptionName: this.subscriptionName,
          webhookUrl: this.webhookUrl,
          ...(isNgrok && {
            note: 'Update Pub/Sub subscription push endpoint in Google Cloud Console if ngrok URL changed'
          })
        }
      });
    } catch (error) {
      monitoringLogger.error('Failed to initialize Pub/Sub service', {
        operation: 'pubsub-initialize'
      }, error as Error);
      // Don't throw - allow graceful degradation if Pub/Sub is not configured
    }
  }

  /**
   * Get the full topic resource name (projects/{project}/topics/{topic})
   */
  getTopicResourceName(): string {
    if (!this.pubsub) {
      throw ErrorFactory.oauthService(
        ErrorCodes.OAUTH_CONFIGURATION_ERROR,
        'Pub/Sub service not initialized'
      );
    }

    return `projects/${this.projectId}/topics/${this.topicName}`;
  }

  /**
   * Get Google's JWKS client for JWT verification
   */
  private getJwksClient() {
    return jwksClient({
      jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
      rateLimit: true,
      jwksRequestsPerMinute: 10
    });
  }

  /**
   * Get signing key for JWT verification
   */
  private async getSigningKey(kid: string): Promise<string> {
    const client = this.getJwksClient();
    return new Promise((resolve, reject) => {
      client.getSigningKey(kid, (err, key) => {
        if (err) {
          reject(err);
          return;
        }
        const signingKey = key?.getPublicKey();
        if (!signingKey) {
          reject(new Error('Unable to get signing key'));
          return;
        }
        resolve(signingKey);
      });
    });
  }

  /**
   * Verify Pub/Sub message JWT token from Authorization header
   */
  async verifyJwtToken(authHeader: string | undefined): Promise<boolean> {

    if (!authHeader) {
      monitoringLogger.warn('Missing Authorization header in Pub/Sub request', {
        operation: 'pubsub-verify-jwt'
      });
      return false;
    }

    // Extract token from "Bearer <token>" format
    const tokenMatch = authHeader.match(/^Bearer (.+)$/);
    if (!tokenMatch) {
      monitoringLogger.warn('Invalid Authorization header format', {
        operation: 'pubsub-verify-jwt'
      });
      return false;
    }

    const token = tokenMatch[1];

    try {
      // Decode token to get kid (key ID) without verification
      const decoded = jwt.decode(token, { complete: true });

      if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
        monitoringLogger.warn('Invalid JWT token structure', {
          operation: 'pubsub-verify-jwt'
        });
        return false;
      }

      // Get the signing key
      const signingKey = await this.getSigningKey(decoded.header.kid);

      let verified: jwt.JwtPayload;
      try {
        verified = jwt.verify(token, signingKey, {
          algorithms: ['RS256'],
          issuer: 'https://accounts.google.com',
          audience: this.webhookUrl
        }) as jwt.JwtPayload;
      } catch (verifyError: any) {
        monitoringLogger.warn('JWT verification failed', {
          operation: 'pubsub-verify-jwt'
        }, verifyError);
        return false;
      }

      const serviceAccountEmail = verified.email;
      const isValidServiceAccount = serviceAccountEmail && typeof serviceAccountEmail === 'string' && serviceAccountEmail.endsWith('.iam.gserviceaccount.com');

      if (!isValidServiceAccount) {
        monitoringLogger.warn('Invalid JWT token - not a Google service account', {
          operation: 'pubsub-verify-jwt'
        });
        return false;
      }

      return true;
    } catch (error) {
      monitoringLogger.error('JWT verification failed', {
        operation: 'pubsub-verify-jwt'
      }, error as Error);
      return false;
    }
  }
}

export const pubsubService = new PubSubService();

