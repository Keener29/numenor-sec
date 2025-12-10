/**
 * Google Cloud Pub/Sub Service
 * Handles Pub/Sub topic and subscription management for Gmail push notifications
 */

import { PubSub } from '@google-cloud/pubsub';
import { monitoringLogger } from '../../../utils/logger.js';
import { ErrorFactory, ErrorCodes } from '../errorHandler.js';

class PubSubService {
  private pubsub: PubSub | null = null;
  private topicName: string;
  private subscriptionName: string;
  private webhookUrl: string;

  constructor() {
    this.topicName = process.env.GMAIL_PUBSUB_TOPIC || 'gmail-notifications';
    this.subscriptionName = process.env.GMAIL_PUBSUB_SUBSCRIPTION || 'gmail-notifications-sub';
    
    // Webhook URL for push subscription
    const baseUrl = process.env.PUBSUB_WEBHOOK_URL || 
      (process.env.NODE_ENV === 'production' 
        ? 'https://numenorsecurity.com' 
        : 'http://localhost:3001');
    this.webhookUrl = `${baseUrl}/api/gmail-notify`;

    this.initialize();
  }

  private initialize(): void {
    try {
      // Initialize Pub/Sub client
      // Uses Application Default Credentials (ADC) or GOOGLE_APPLICATION_CREDENTIALS env var
      this.pubsub = new PubSub({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLIENT_ID?.split('-')[0]
      });

      const isNgrok = this.webhookUrl.includes('ngrok.io') || this.webhookUrl.includes('ngrok-free.app');
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
    const projectId = this.pubsub.projectId;
    return `projects/${projectId}/topics/${this.topicName}`;
  }

  /**
   * Verify Pub/Sub message authenticity
   * Note: For production, you should verify the JWT token from Pub/Sub
   * This is a simplified version - in production, verify the Authorization header JWT
   */
  verifyMessage(message: any): boolean {
    // Basic validation - in production, verify JWT signature
    // For now, we'll rely on HTTPS and the webhook URL being secret
    // TODO: Implement proper JWT verification using Google's public keys
    return !!message && !!message.message && !!message.message.data;
  }
}

export const pubsubService = new PubSubService();

