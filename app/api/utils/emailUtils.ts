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
  
  // Limit input length to prevent DoS attacks
  if (senderEmail.length > 1000) return false;
  
  // Extract email address from header format
  // Handle formats like: "Display Name <email@domain.com>" or just "email@domain.com"
  let emailAddress = senderEmail.trim();
  
  // If it contains < and >, extract the email address between them
  // Use a safer regex that limits backtracking
  if (emailAddress.includes('<') && emailAddress.includes('>')) {
    const match = emailAddress.match(/<([^<>]{1,254})>/);
    if (match && match[1]) {
      emailAddress = match[1].trim();
    }
  }
  
  // Validate email format more strictly
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(emailAddress)) return false;
  
  // Extract domain from email address
  const parts = emailAddress.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  
  const domain = parts[1]?.toLowerCase().trim();
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
  // Use exact match or proper subdomain validation
  return ownServiceDomains.some(ownDomain => {
    if (domain === ownDomain) return true;
    
    // Only allow legitimate subdomains (e.g., mail.numenorsecurity.com)
    // Prevent spoofing like evil-numenorsecurity.com
    if (domain.endsWith('.' + ownDomain)) {
      const subdomain = domain.slice(0, -(ownDomain.length + 1));
      // Ensure subdomain doesn't contain dots (prevents nested subdomain attacks)
      return !subdomain.includes('.');
    }
    
    return false;
  });
}
