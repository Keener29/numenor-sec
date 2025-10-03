import { useState } from "react";
import { emailsAPI } from "../utils/api";

interface Email {
  id: number;
  emailAddress: string;
  isConnected: boolean;
  createdAt: string;
}

interface ConnectedEmailsDropdownProps {
  emails: Email[];
  onEmailsUpdate: () => void;
}

export default function ConnectedEmailsDropdown({ emails, onEmailsUpdate }: ConnectedEmailsDropdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddingEmail, setIsAddingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState("");

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
      
      await emailsAPI.addEmail({ emailAddress: newEmail.trim() });
      setNewEmail("");
      onEmailsUpdate(); // Refresh the emails list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add email");
      console.error("Add email error:", err);
    } finally {
      setIsAddingEmail(false);
    }
  };

  const connectedEmails = emails.filter(email => email.isConnected);
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
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
            >
              <svg
                className={`h-5 w-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <div className="space-y-3">
              {emails.length > 0 ? (
                emails.map((email) => (
                  <div key={email.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900">
                          {email.emailAddress}
                        </span>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          email.isConnected 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {email.isConnected ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Added: {formatDate(email.createdAt)}
                      </div>
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
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
        )}
      </div>
    </div>
  );
}
