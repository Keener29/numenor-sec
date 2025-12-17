/**
 * Email utility functions for phishing detection
 */

import { getDomain, parse } from "tldts";

/**
 * Safely strip HTML tags from text to prevent ReDoS attacks
 * Uses /<[^>]+>/g instead of /<[^>]*>/g to avoid catastrophic backtracking
 * @param text - Text that may contain HTML tags
 * @param maxLength - Maximum input length to prevent DoS (default: 10MB)
 * @returns Text with HTML tags removed
 */
export function stripHtmlTags(text: string, maxLength: number = 10 * 1024 * 1024): string {
  if (!text) return '';
  
  // Prevent DoS by limiting input size
  if (text.length > maxLength) {
    throw new Error(`Input text exceeds maximum length of ${maxLength} characters`);
  }
  
  // The + quantifier requires at least one character, reducing backtracking potential
  return text.replaceAll(/<[^>]*?>/g, ''); // safe from ReDoS
}

// Simple safe HTML-entity decoder
export function decodeHtmlEntities(text: string): string {
  return text
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"');
}

export function extractEmailAddress(senderEmail: string): string | null {
  if (!senderEmail || senderEmail.length > 512) return null;
  
  let extracted = senderEmail.trim();
  const start = extracted.indexOf("<");
  const end = extracted.indexOf(">");
  if (start !== -1 && end !== -1 && end > start + 1) {
    extracted = extracted.slice(start + 1, end);
  }
  return extracted.trim();
}

/**
 * Check if an email is from our own service (should be excluded from analysis)
 * @param emailAddress - The email address to check
 * @returns true if the email is from our own service domains
 */
export function isFromOwnService(emailAddress: string | null): boolean {

  if (!emailAddress) return false;

  const parts = emailAddress.split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1];
  const local = parts[0];
  if (!domain || !local) return false;

  // Known legitimate local/service domains
  const ownServiceDomains = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "numenorsecurity.com",
  ];

  // Quick allow for localhost and IPs (and their subdomains)
  if (
    domain === "localhost" ||
    domain.endsWith(".localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(domain) ||
    domain.endsWith(".127.0.0.1") ||
    domain.endsWith(".0.0.0.0")
  ) {
    return true;
  }

  // For each own domain, verify cleanly
  return ownServiceDomains.some((ownDomain) => {
    const domainLower = domain.trim().toLowerCase();
    const ownLower = ownDomain.trim().toLowerCase();

    // Exact match → ✅
    if (domainLower === ownLower) return true;

    // Compare registered/base domains using tldts
    const domainRoot = getDomain(domainLower) || domainLower;
    const ownRoot = getDomain(ownLower) || ownLower;
    if (domainRoot !== ownRoot) return false;

    // Parse subdomain to limit nesting
    const { subdomain } = parse(domainLower);
    const depth = subdomain ? subdomain.split(".").length : 0;

    // Allow typical depth (mail/service prefixes), block deep spoofing
    return depth <= 2;
  });
}
