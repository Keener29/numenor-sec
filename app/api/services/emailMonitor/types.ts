export interface MonitoredEmail {
  id: number;
  businessId: number;
  emailAddress: string;
  isConnected: boolean;
  lastChecked: Date | null;
}

// Re-export EmailMessage from canonical types location
export type { EmailMessage } from '../../types/email.js';
