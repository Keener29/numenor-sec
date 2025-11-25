import { useState, useEffect } from "react";

interface Email {
  id: number;
  emailAddress: string;
  isConnected: boolean;
}

interface OAuthStatus {
  isConnected: boolean;
  connectedAt: string | null;
}

interface UseOAuthStatusesReturn {
  oauthStatuses: Record<string, OAuthStatus>;
  isLoading: boolean;
  error: string | null;
  refreshOAuthStatuses: () => Promise<void>;
}

export function useOAuthStatuses(emails: Email[]): UseOAuthStatusesReturn {
  const [oauthStatuses, setOauthStatuses] = useState<Record<string, OAuthStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkOAuthStatuses = async () => {
    if (emails.length === 0) {
      setOauthStatuses({});
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const statusPromises = emails.map(async (email) => {
        try {
          const response = await fetch(`http://localhost:3001/api/status/${encodeURIComponent(email.emailAddress)}`, {
            credentials: 'include'
          });
          
          if (response.ok) {
            const data = await response.json();
            return { emailAddress: email.emailAddress, status: data };
          }
          return { emailAddress: email.emailAddress, status: { isConnected: false, connectedAt: null } };
        } catch (error) {
          console.error(`Error checking OAuth status for ${email.emailAddress}:`, error);
          return { emailAddress: email.emailAddress, status: { isConnected: false, connectedAt: null } };
        }
      });

      const results = await Promise.all(statusPromises);
      const statusMap: Record<string, OAuthStatus> = {};
      
      for (const { emailAddress, status } of results) {
        statusMap[emailAddress] = {
          isConnected: status.isConnected,
          connectedAt: status.connectedAt
        };
      }

      setOauthStatuses(statusMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check OAuth statuses");
      console.error("OAuth status check error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Check OAuth statuses when emails change
  useEffect(() => {
    checkOAuthStatuses();
  }, [emails]);

  return {
    oauthStatuses,
    isLoading,
    error,
    refreshOAuthStatuses: checkOAuthStatuses
  };
}
