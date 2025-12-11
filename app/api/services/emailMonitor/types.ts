export interface MonitoredEmail {
  id: number;
  businessId: number;
  emailAddress: string;
  isConnected: boolean;
  lastChecked: Date | null;
}

export interface EmailMessage {
  id: string;
  subject: string;
  body: string;
  sender: string;
  recipient: string;
  timestamp: Date;
  attachments?: string[];
  links?: string[];
  headers?: Record<string, string>;
  labels?: string[];
}
