/**
 * Email utility functions for phishing detection
 */

import { getDomain, parse } from "tldts";

/**
 * Check if an email is from our own service (should be excluded from analysis)
 * @param senderEmail - The sender's email address
 * @returns true if the email is from our own service domains
 */
export function isFromOwnService(senderEmail: string): boolean {
  if (!senderEmail) return false;

  // Prevent DoS or malformed input
  if (senderEmail.length > 512) return false;

  // Extract email address from header format: "Name <email@domain.com>"
  const emailMatch = senderEmail.match(/<?([\w.%+-]+@[^\s<>]{1,254})>?/);
  if (!emailMatch) return false;

  const emailAddress = emailMatch[1].trim().toLowerCase();
  const [_, domain = ""] = emailAddress.split("@");
  if (!domain) return false;

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
