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
  isModalOpen: boolean;
  setIsModalOpen: (isModalOpen: boolean) => void;
  emails: Email[];
  onEmailsUpdate: () => void;
  oauthStatuses: Record<string, OAuthStatus>;
}

const MAX_EMAILS = 5;
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ConnectedEmailsDropdown({ isModalOpen, setIsModalOpen, emails, onEmailsUpdate, oauthStatuses }: ConnectedEmailsDropdownProps) {
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [error, setError] = useState("");
  const [bulkProgress, setBulkProgress] = useState<{ total: number; current: number; success: number; failed: number; errors: string[] } | null>(null);
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

  // Parse emails from bulk input (supports comma-separated, line-separated, or both)
  // Note: Basic client-side validation for UX only. Backend does comprehensive validation.
  const parseBulkEmails = (input: string): string[] => {
    const MAX_INPUT_SIZE = 10000; // Limit bulk input size to prevent DoS

    // Limit input size to prevent DoS attacks
    if (input.length > MAX_INPUT_SIZE) {
      return [];
    }

    const emails: string[] = [];

    // Split by both commas and newlines, then filter and validate
    const parts = input
      .split(/[,\n]/)
      .map(part => part.trim())
      .filter(part => part.length > 0 && part.length <= 320); // Basic length check

    for (const part of parts) {
      const normalized = part.toLowerCase().trim();
      // Basic format check - backend will do comprehensive validation
      if (BASIC_EMAIL_REGEX.test(normalized)) {
        emails.push(normalized);
      }
    }

    return [...new Set(emails)]; // Remove duplicates
  };

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isBulkMode) {
      await handleAddBulkEmails();
      return;
    }

    // Check email limit
    if (emails.length >= MAX_EMAILS) {
      setError(`Maximum of ${MAX_EMAILS} emails allowed. Please remove an email before adding a new one.`);
      return;
    }

    if (!newEmail.trim()) {
      setError("Email address is required");
      return;
    }

    // Basic email validation
    if (!BASIC_EMAIL_REGEX.test(newEmail.trim())) {
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

  const hasReachedEmailLimit = (parsedEmails: string[]) => {
    // Check if adding these emails would exceed the limit
    const currentCount = parsedEmails.length;
    const availableSlots = MAX_EMAILS - emails.length;

    if (availableSlots > 0 && currentCount > availableSlots) {
      setError(`You can only add ${availableSlots} more ${availableSlots === 1 ? 'email' : 'emails'}. You have ${parsedEmails.length} ${parsedEmails.length === 1 ? 'email' : 'emails'} in your input.`);
      return false;
    } else if (availableSlots <= 0) {
      setError(`You have reached the maximum number of emails allowed. You can only add ${MAX_EMAILS} emails.`);
      return false;
    }
    return true;
  };

  const buildMessageForEmailLimit = (successCount: number, failedCount: number, warnings: string[], duplicates: string[]) => {
    const messages: string[] = [];
    if (successCount > 0) {
      messages.push(`Successfully added ${successCount} ${successCount === 1 ? 'email' : 'emails'}.`);
    }
    if (duplicates.length > 0) {
      messages.push(`Skipped ${duplicates.length} duplicate(s): ${duplicates.join(', ')}`);
    }
    if (failedCount > 0) {
      messages.push(`Failed to send permission emails to ${failedCount} ${failedCount === 1 ? 'address' : 'addresses'}.`);
    }
    if (warnings.length > 0) {
      messages.push(...warnings);
    }

    if (messages.length > 0) {
      setError(messages.join('\n'));
    }
  };

  const buildErrorMessage = (err: any) => {
    const errorMessage = err?.message || "Failed to add emails";
    const errorData = err?.errorData || {};

    // Build detailed error message
    let fullError = errorMessage;
    if (errorData.duplicates && errorData.duplicates.length > 0) {
      fullError += `\nDuplicates: ${errorData.duplicates.join(', ')}`;
    }
    if (errorData.availableSlots !== undefined) {
      fullError += `\nAvailable slots: ${errorData.availableSlots}`;
    }

    setError(fullError);
    setBulkProgress(null);
    console.error("Bulk add email error:", err);
  };

  const handleAddBulkEmails = async () => {
    if (!bulkEmails.trim()) {
      setError("Please enter at least one email address");
      return;
    }

    const parsedEmails = parseBulkEmails(bulkEmails);

    if (parsedEmails.length === 0) {
      setError("No valid email addresses found. Please check your input.");
      return;
    }
    if (!hasReachedEmailLimit(parsedEmails)) {
      return;
    }
    try {
      setIsAddingEmail(true);
      setError("");
      setBulkProgress({ total: parsedEmails.length, current: parsedEmails.length, success: 0, failed: 0, errors: [] });

      // Use the bulk API endpoint
      const result = await emailsAPI.addBulkEmails({ emailAddresses: parsedEmails });

      const successCount = result.summary?.added || 0;
      const failedCount = result.summary?.permissionEmailsFailed || 0;
      const warnings = result.warnings || [];
      const duplicates = result.duplicates || [];
      buildMessageForEmailLimit(successCount, failedCount, warnings, duplicates);

      setBulkProgress({
        total: parsedEmails.length,
        current: parsedEmails.length,
        success: successCount,
        failed: failedCount,
        errors: result.permissionEmailResults?.filter((r: { success: boolean }) => !r.success).map((r: { email: string; error?: string }) => `${r.email}: ${r.error || 'Failed to send permission email'}`) || []
      });

      if (successCount > 0) {
        onEmailsUpdate(); // Refresh the emails list
      }

      if (successCount === parsedEmails.length && failedCount === 0) {
        // All succeeded, close modal after a short delay
        setTimeout(() => {
          setBulkEmails("");
          setIsModalOpen(false);
        }, 2000);
      }
    } catch (err: any) {
      buildErrorMessage(err);
    } finally {
      setIsAddingEmail(false);
      setTimeout(() => setBulkProgress(null), 5000); // Clear progress after 5 seconds
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
  const bulkEmailsCount = parseBulkEmails(bulkEmails).length;
  const isDisabled =
    isAddingEmail ||
    emails.length >= MAX_EMAILS ||
    (isBulkMode ? !bulkEmails.trim() : !newEmail.trim());

  let buttonText = "Add Email";

  if (isAddingEmail) {
    buttonText = isBulkMode && bulkProgress
      ? `Adding ${bulkProgress.current}/${bulkProgress.total}...`
      : "Adding...";
  } else if (emails.length >= MAX_EMAILS) {
    buttonText = "Limit Reached";
  } else if (isBulkMode) {
    const count = bulkEmails.trim() ? bulkEmailsCount : 0;
    buttonText = `Add ${count} ${count === 1 ? "Email" : "Emails"}`;
  } else {
    buttonText = "Add Email";
  }
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
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Add New Email {emails.length >= MAX_EMAILS && <span className="text-gray-500 font-normal">(Limit reached: {MAX_EMAILS} emails)</span>}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsBulkMode(!isBulkMode);
                        setError("");
                        setBulkProgress(null);
                        // Clear the other input when switching modes
                        if (isBulkMode) {
                          setBulkEmails("");
                        } else {
                          setNewEmail("");
                        }
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      {isBulkMode ? "Switch to single email" : "Add multiple emails"}
                    </button>
                  </div>

                  <form onSubmit={handleAddEmail} className="space-y-3">
                    {isBulkMode ? (
                      <div>
                        <textarea
                          id="bulkEmails"
                          value={bulkEmails}
                          onChange={(e) => {
                            // Limit input size to prevent DoS (10KB max)
                            if (e.target.value.length <= 10000) {
                              setBulkEmails(e.target.value);
                            }
                          }}
                          placeholder={`Enter email addresses separated by commas or new lines
Example:
email1@example.com
email2@example.com, email3@example.com`}
                          rows={6}
                          maxLength={10000}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm bg-white text-gray-900 font-mono disabled:bg-gray-100 disabled:cursor-not-allowed"
                          disabled={isAddingEmail || emails.length >= MAX_EMAILS}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          {emails.length} of {MAX_EMAILS} emails added. {bulkEmails.trim() && bulkEmailsCount > 0 && `Found ${bulkEmailsCount} valid ${bulkEmailsCount === 1 ? 'email' : 'emails'} in input.`}
                        </p>
                        {bulkProgress && (
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-600">Progress: {bulkProgress.current} / {bulkProgress.total}</span>
                              <span className="text-green-600">✓ {bulkProgress.success} success</span>
                              {bulkProgress.failed > 0 && <span className="text-red-600">✗ {bulkProgress.failed} failed</span>}
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <input
                          type="email"
                          id="newEmail"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          placeholder="Enter email address to monitor"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm bg-white text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                          disabled={isAddingEmail || emails.length >= MAX_EMAILS}
                        />
                        {emails.length < MAX_EMAILS && (
                          <p className="mt-1 text-xs text-gray-500">
                            {emails.length} of {MAX_EMAILS} emails added
                          </p>
                        )}
                      </div>
                    )}

                    {error && (
                      <div className="text-red-600 text-sm whitespace-pre-line">
                        {error.split('\n').map((line, i) => (
                          <div key={i}>{line}</div>
                        ))}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isDisabled}
                      className="w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {buttonText}
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
