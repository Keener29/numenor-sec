/**
 * Email utility functions for phishing detection
 */

/**
 * Check if an email is from our own service (should be excluded from analysis)
 * @param senderEmail - The sender's email address
 * @returns true if the email is from our own service domains
 */
export function isFromOwnService(senderEmail: string): boolean {
  if (!senderEmail) return false;
  
  // Extract domain from sender email
  const parts = senderEmail.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false; // Invalid email format
  
  const domain = parts[1]?.toLowerCase();
  if (!domain) return false;
  
  // List of domains that should be excluded from analysis
  const ownServiceDomains = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    'numenorsecurity.com'
  ];
  
  // Check if domain matches any of our own service domains
  return ownServiceDomains.some(ownDomain => 
    domain === ownDomain || domain.endsWith('.' + ownDomain)
  );
}
