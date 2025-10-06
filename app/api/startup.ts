import { emailMonitor } from './services/emailMonitor.js';
import { emailService } from './utils/emailService.js';

/**
 * Initialize and start all background services
 */
export async function initializeServices(): Promise<void> {
  console.log('🚀 Initializing Numenor Security services...');

  try {
    // Test email service connection
    console.log('📧 Testing email service connection...');
    const emailConnected = await emailService.testConnection();
    if (emailConnected) {
      console.log('✅ Email service connected successfully');
    } else {
      console.log('⚠️ Email service connection failed - check SMTP configuration');
    }

    // Start email monitoring service
    console.log('👁️ Starting email monitoring service...');
    await emailMonitor.startMonitoring();
    console.log('✅ Email monitoring service started');

    console.log('🎉 All services initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    throw error;
  }
}

/**
 * Gracefully shutdown all services
 */
export async function shutdownServices(): Promise<void> {
  console.log('🛑 Shutting down services...');

  try {
    // Stop email monitoring
    emailMonitor.stopMonitoring();
    console.log('✅ Email monitoring service stopped');

    console.log('✅ All services shut down gracefully');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await shutdownServices();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await shutdownServices();
  process.exit(0);
});
