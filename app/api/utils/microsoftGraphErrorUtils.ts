/**
 * Microsoft Graph Error Utilities
 * Shared functions for determining if Microsoft Graph API errors are retryable
 */

/**
 * Check if a Microsoft Graph API error is retryable
 * Handles both Axios-style and Fetch-style errors
 * 
 * @param error - The error object to check
 * @returns true if the error is retryable (network errors, rate limits, transient failures)
 */
export function isRetryableGraphError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const anyErr = error as any;
  
  // Extract status code from different error formats
  const status = anyErr?.response?.status || anyErr?.status;
  const code = anyErr?.response?.data?.error?.code;
  
  // Extract error message/name
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = anyErr?.name;
  const errorCode = anyErr?.code;

  // Network/timeout errors
  if (
    errorMessage.includes('ECONNRESET') ||
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('ENOTFOUND') ||
    errorMessage.includes('FetchError') ||
    errorCode === 'ECONNRESET' ||
    errorCode === 'ETIMEDOUT' ||
    errorName === 'FetchError'
  ) {
    return true;
  }

  // Retryable HTTP status codes
  if ([408, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  // Microsoft Graph-specific transient error
  // ErrorItemNotFound can occur when message hasn't propagated yet
  if (status === 404 && code === 'ErrorItemNotFound') {
    return true;
  }

  return false;
}

