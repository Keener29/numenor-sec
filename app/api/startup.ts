import { emailMonitor } from './services/emailMonitor/index.js';
import { emailService } from './services/emailService.js';
import { watchRenewalScheduler } from './services/watchRenewalScheduler.js';
import { logger } from '../utils/logger.js';

/**
 * Initialize and start all background services
 */
export async function initializeServices(): Promise<void> {
  logger.info('Initializing Numenor Security services', { operation: 'initialize-services' });

  try {
    // Test email service connection
    logger.info('Testing email service connection', { operation: 'test-email-connection' });
    const emailConnected = await emailService.testConnection();
    if (emailConnected) {
      logger.info('Email service connected successfully', { operation: 'test-email-connection' });
    } else {
      logger.warn('Email service connection failed - check SMTP configuration', { operation: 'test-email-connection' });
    }

    // Initialize email monitoring service (event-driven, no polling)
    logger.info('Initializing email monitoring service (event-driven)', { operation: 'initialize-email-monitoring' });
    await emailMonitor.initialize();
    logger.info('Email monitoring service initialized', { operation: 'initialize-email-monitoring' });

    // Start Gmail watch renewal scheduler
    logger.info('Starting Gmail watch renewal scheduler', { operation: 'start-watch-renewal' });
    await watchRenewalScheduler.start();
    logger.info('Gmail watch renewal scheduler started', { operation: 'start-watch-renewal' });

    logger.info('All services initialized successfully', { operation: 'initialize-services' });
  } catch (error) {
    logger.error('Failed to initialize services', { operation: 'initialize-services' }, error as Error);
    throw error;
  }
}

/**
 * Gracefully shutdown all services
 */
export async function shutdownServices(): Promise<void> {
  logger.info('Shutting down services', { operation: 'shutdown-services' });

  try {
    // Stop email monitoring
    emailMonitor.stopMonitoring();
    logger.info('Email monitoring service stopped', { operation: 'shutdown-services' });

    // Stop watch renewal scheduler
    watchRenewalScheduler.stop();
    logger.info('Gmail watch renewal scheduler stopped', { operation: 'shutdown-services' });

    logger.info('All services shut down gracefully', { operation: 'shutdown-services' });
  } catch (error) {
    logger.error('Error during shutdown', { operation: 'shutdown-services' }, error as Error);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully', { operation: 'signal-handler' });
  await shutdownServices();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully', { operation: 'signal-handler' });
  await shutdownServices();
  process.exit(0);
});
