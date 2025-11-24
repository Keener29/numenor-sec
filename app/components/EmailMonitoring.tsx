import { useState } from "react";
import Dropdown from "./Dropdown";

interface Alert {
  id: number;
  emailId: number;
  subject: string;
  senderEmail: string;
  alertType: string;
  threatLevel: string;
  status: string;
  description?: string;
  createdAt: string;
}

interface Email {
  id: number;
  emailAddress: string;
  isConnected: boolean;
}

interface OAuthStatus {
  isConnected: boolean;
  connectedAt: string | null;
}

interface EmailMonitoringProps {
  readonly emails: Email[];
  readonly alerts: Alert[];
  readonly onMarkSafe: (alertId: number) => void;
  readonly oauthStatuses: Record<string, OAuthStatus>;
}

export default function EmailMonitoring({ emails, alerts, onMarkSafe, oauthStatuses }: EmailMonitoringProps) {
  const [expandedEmails, setExpandedEmails] = useState<Set<number>>(new Set());

  const toggleEmailExpansion = (emailId: number) => {
    const newExpanded = new Set(expandedEmails);
    if (newExpanded.has(emailId)) {
      newExpanded.delete(emailId);
    } else {
      newExpanded.add(emailId);
    }
    setExpandedEmails(newExpanded);
  };

  const getThreatColor = (threatLevel: string) => {
    switch (threatLevel) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'safe': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'reviewed': return 'bg-blue-100 text-blue-800';
      case 'threat': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
          Email Monitoring
        </h3>
        <div className="space-y-3">
          {emails.map((email) => {
            const emailAlerts = alerts.filter(alert => alert.emailId === email.id);
            const pendingAlerts = emailAlerts.filter(alert => alert.status !== 'safe');
            const isExpanded = expandedEmails.has(email.id);
            
            const oauthStatus = oauthStatuses[email.emailAddress];
            const isGmailConnected = oauthStatus?.isConnected || false;

            let statusClass = 'bg-red-100 text-red-800';
            let statusText = 'Not Connected';
            if (isGmailConnected) {
              statusClass = 'bg-green-100 text-green-800';
              statusText = 'Gmail Connected';
            } else if (email.isConnected) {
              statusClass = 'bg-yellow-100 text-yellow-800';
              statusText = 'Permission Pending';
            }
            
            const headerContent = (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusClass}`}
                >
                  {statusText}
                </span>
                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                  {pendingAlerts.length} Pending
                </span>
                {emailAlerts.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {emailAlerts.length} alert{emailAlerts.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            );

            const rightAction = pendingAlerts.length > 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  for (const alert of pendingAlerts) {
                    onMarkSafe(alert.id);
                  }
                }}
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 cursor-pointer whitespace-nowrap"
              >
                Mark All Safe
              </button>
            ) : null;

            const alertContent = emailAlerts.length > 0 ? (
              <div className="space-y-3">
                {emailAlerts.map((alert) => {
                  return (
                    <div key={alert.id} className={`border rounded-lg p-3 ${alert.status === 'safe' ? 'bg-gray-50' : 'bg-white'}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getThreatColor(alert.threatLevel)}`}>
                              {alert.threatLevel.toUpperCase()}
                            </span>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(alert.status)}`}>
                              {alert.status}
                            </span>
                          </div>
                          
                          <div className="space-y-1 text-sm">
                            <div>
                              <span className="font-medium text-gray-700">Subject:</span>
                              <span className="ml-2 text-gray-900">{alert.subject}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">From:</span>
                              <span className="ml-2 text-gray-900">{alert.senderEmail}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Type:</span>
                              <span className="ml-2 text-gray-900">{alert.alertType}</span>
                            </div>
                            {alert.description && (
                              <div>
                                <span className="font-medium text-gray-700">Description:</span>
                                <span className="ml-2 text-gray-900">{alert.description}</span>
                              </div>
                            )}
                            <div>
                              <span className="font-medium text-gray-700">Detected:</span>
                              <span className="ml-2 text-gray-900">
                                {new Date(alert.createdAt).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {alert.status !== 'safe' && (
                          <button
                            onClick={() => onMarkSafe(alert.id)}
                            className="ml-4 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 cursor-pointer"
                          >
                            Mark Safe
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-gray-500 text-sm">
                No alerts for this email address
              </div>
            );
            
            return (
              <div key={email.id} className="relative">
                <Dropdown
                  title={email.emailAddress}
                  isExpanded={isExpanded}
                  onToggle={() => toggleEmailExpansion(email.id)}
                  headerContent={headerContent}
                  rightAction={rightAction}
                >
                  {alertContent}
                </Dropdown>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
