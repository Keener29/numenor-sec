import { useState, useEffect } from "react";
import { emailsAPI } from "../utils/api";

interface Email {
  id: number;
  emailAddress: string;
  isConnected: boolean;
  createdAt: string;
}

interface OAuthStatus {
  isConnected: boolean;
  connectedAt: string | null;
}

interface ConnectedEmailsDropdownProps {
  emails: Email[];
  onEmailsUpdate: () => void;
  businessName: string;
  oauthStatuses: Record<string, OAuthStatus>;
}

export default function ConnectedEmailsDropdown({ emails, onEmailsUpdate, businessName, oauthStatuses }: ConnectedEmailsDropdownProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<{ [key: number]: 'resend' | 'delete' | null }>({});

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };

    if (isModalOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isModalOpen]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!newEmail.trim()) {
      setError("Email address is required");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      setError("Please enter a valid email address");
      return;
    }

    try {
      setIsAddingEmail(true);
      setError("");
      
      console.log("Attempting to add email:", newEmail.trim());
      const result = await emailsAPI.addEmail({ emailAddress: newEmail.trim() });
      console.log("Add email result:", result);
      
      setNewEmail("");
      onEmailsUpdate(); // Refresh the emails list
      setIsModalOpen(false); // Close modal after successful addition
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add email");
      console.error("Add email error:", err);
    } finally {
      setIsAddingEmail(false);
    }
  };

  const handleResendEmail = async (emailId: number, emailAddress: string) => {
    try {
      setActionLoading(prev => ({ ...prev, [emailId]: 'resend' }));
      
      await emailsAPI.resendPermissionEmail(emailId);
      setError(""); // Clear any previous errors
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend email");
      console.error("Resend email error:", err);
    } finally {
      setActionLoading(prev => ({ ...prev, [emailId]: null }));
    }
  };

  const handleDeleteEmail = async (emailId: number) => {
    if (!confirm("Are you sure you want to remove this email from monitoring? This action cannot be undone.")) {
      return;
    }

    try {
      setActionLoading(prev => ({ ...prev, [emailId]: 'delete' }));
      
      await emailsAPI.removeEmail(emailId);
      onEmailsUpdate(); // Refresh the emails list
      setError(""); // Clear any previous errors
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete email");
      console.error("Delete email error:", err);
    } finally {
      setActionLoading(prev => ({ ...prev, [emailId]: null }));
    }
  };

  // Only count emails that have Gmail OAuth connected
  const connectedEmails = emails.filter(email => {
    const oauthStatus = oauthStatuses[email.emailAddress];
    return oauthStatus?.isConnected || false;
  });
  const totalEmails = emails.length;

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
              <span className="text-white text-sm font-medium">📧</span>
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                Connected Emails
              </dt>
              <dd className="text-lg font-medium text-gray-900">
                {connectedEmails.length} / {totalEmails}
              </dd>
            </dl>
          </div>
          <div className="ml-4 flex-shrink-0">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            >
              Manage Emails
            </button>
          </div>
        </div>

        {/* Modal */}
        {isModalOpen && (
          <div 
            className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsModalOpen(false);
              }
            }}
          >
            <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Email Monitoring Details
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Content */}
              <div className="space-y-4">
                {emails.length > 0 ? (
                  emails.map((email) => (
                    <div key={email.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">
                            {email.emailAddress}
                          </span>
                          {(() => {
                            const oauthStatus = oauthStatuses[email.emailAddress];
                            const isGmailConnected = oauthStatus?.isConnected || false;
                            
                            if (isGmailConnected) {
                              return (
                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                  Gmail Connected
                                </span>
                              );
                            } else if (email.isConnected) {
                              return (
                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                  Permission Pending
                                </span>
                              );
                            } else {
                              return (
                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                  Not Connected
                                </span>
                              );
                            }
                          })()}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Added: {formatDate(email.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        {(() => {
                          const oauthStatus = oauthStatuses[email.emailAddress];
                          const isGmailConnected = oauthStatus?.isConnected || false;
                          
                          // Only show resend button if Gmail is not connected
                          if (!isGmailConnected) {
                            return (
                              <button
                                onClick={() => handleResendEmail(email.id, email.emailAddress)}
                                disabled={actionLoading[email.id] === 'resend'}
                                className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Resend permission request email"
                              >
                                {actionLoading[email.id] === 'resend' ? 'Sending...' : 'Resend'}
                              </button>
                            );
                          }
                          return null;
                        })()}
                        <button
                          onClick={() => handleDeleteEmail(email.id)}
                          disabled={actionLoading[email.id] === 'delete'}
                          className="px-3 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Remove email from monitoring"
                        >
                          {actionLoading[email.id] === 'delete' ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500 text-sm py-4">
                    No emails configured yet
                  </div>
                )}

                {/* Add New Email Form */}
                <div className="border-t border-gray-200 pt-4">
                  <form onSubmit={handleAddEmail} className="space-y-3">
                    <div>
                      <label htmlFor="newEmail" className="block text-sm font-medium text-gray-700 mb-1">
                        Add New Email
                      </label>
                      <input
                        type="email"
                        id="newEmail"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="Enter email address to monitor"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm bg-white text-gray-900"
                        disabled={isAddingEmail}
                      />
                    </div>
                    
                    {error && (
                      <div className="text-red-600 text-sm">{error}</div>
                    )}
                    
                    <button
                      type="submit"
                      disabled={isAddingEmail || !newEmail.trim()}
                      className="w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAddingEmail ? "Adding..." : "Add Email"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
