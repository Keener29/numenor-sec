/**
 * Email utility functions for phishing detection
 */

import { getDomain, parse } from "tldts";
import { resolveMx, resolveTxt } from 'dns/promises';
import { emailLogger } from '../../utils/logger.js';
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
  return text.replaceAll(/<[^>]{0,1000}>/g, ''); // safe from ReDoS
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


async function checkSPF(domain: string) {
  try {
    const records = await resolveTxt(domain);
    for (const recordSet of records) {
      const txt = recordSet.join('');
      if (txt.includes('spf.protection.outlook.com')) return 'outlook';
      if (txt.includes('_spf.google.com')) return 'gmail';
    }
    return null;
  } catch (err) {
    return null;
  }
}
/**
 * Determine OAuth provider based on email domain
 * @param emailAddress - The email address to check
 * @returns 'gmail' for Gmail accounts, 'outlook' for Microsoft/Outlook accounts, or null if unknown
 */
export async function getOAuthProvider(emailAddress: string): Promise<'gmail' | 'outlook' | null> {
  if (!emailAddress) return null;

  const parts = emailAddress.split("@");
  if (parts.length !== 2) return null;

  const domain = parts[1]?.toLowerCase().trim();
  if (!domain) return null;

  const gmailDomains = ['gmail.com', 'googlemail.com'];
  const outlookDomains = ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'office365.com'];
  if (gmailDomains.includes(domain)) return 'gmail';
  if (outlookDomains.includes(domain)) return 'outlook';

  try {
    const mxRecords = await resolveMx(domain);
    for (const record of mxRecords) {
      const exchange = record.exchange.toLowerCase();
      if (exchange.includes('google.com')) return 'gmail';
      if (exchange.includes('outlook.com') || exchange.includes('office365.com') || exchange.includes('protection.outlook.com')) return 'outlook';
    }
    return await checkSPF(domain);
    
  } catch (err) {
    // DNS lookup failed
    return null;
  }
}

/**
 * Check if an email is a reply or forward
 * @param subject - Email subject line
 * @param headers - Email headers
 * @returns true if the email is a reply or forward
 */
export function isReplyOrForward(headers: Record<string, string>): boolean {
   // Check for In-Reply-To header (indicates this is a reply)
  const inReplyTo = headers['in-reply-to'] || headers['In-Reply-To'] || headers['IN-REPLY-TO'];
  if (inReplyTo && inReplyTo.trim().length > 0) {
    return true;
  }

  // Check for References header (indicates this is part of a thread)
  const references = headers['references'] || headers['References'] || headers['REFERENCES'];
  if (references && references.trim().length > 0) {
    return true;
  }

  return false;
}

