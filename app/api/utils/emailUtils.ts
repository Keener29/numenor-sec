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

/**
 * Sanitize HTML by escaping special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Inject inline phishing-warning banner into email HTML
 * 
 * @param originalHtml - The original email HTML
 * @param originalPlain - The original plain-text body
 * @param risk - Risk level: 'low' | 'medium' | 'high' | 'critical'
 * @param score - Optional numeric risk score (0-100)
 * @param reason - Short human-readable reason for the classification
 * @param meta - Metadata object with sender and subject (for contextual wording only)
 * @returns JSON object with modified html and plain_text fields
 */
export function injectPhishingBanner(
  originalHtml: string,
  originalPlain: string,
  risk: 'low' | 'medium' | 'high' | 'critical',
  score: number | null,
  reason: string,
  meta: { sender: string; subject: string }
): { html: string; plain_text: string } {
  // Only modify if risk is medium, high, or critical
  if (risk === 'low') {
    return {
      html: originalHtml,
      plain_text: originalPlain
    };
  }

  // Sanitize reason text
  const sanitizedReason = escapeHtml(reason);

  // Risk level styling
  const riskStyles = {
    medium: {
      background: '#fff4cc',
      borderColor: '#f7c948',
      textColor: '#664d03'
    },
    high: {
      background: '#fff1e0',
      borderColor: '#ff9f43',
      textColor: '#6b3b00'
    },
    critical: {
      background: '#ffecec',
      borderColor: '#ff3b30',
      textColor: '#6b0b0b'
    }
  };

  const style = riskStyles[risk];
  const riskLabel = risk.charAt(0).toUpperCase() + risk.slice(1);

  // Generate banner HTML
  const bannerHtml = `
    <div role="alert" style="background-color: ${style.background}; border-left: 4px solid ${style.borderColor}; color: ${style.textColor}; padding: 12px 16px; margin: 0 0 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.5; max-width: 100%; box-sizing: border-box;">
      <div style="font-weight: bold; margin-bottom: 8px; font-size: 15px;">
        ⚠️ ${riskLabel.toUpperCase()} RISK
      <div style="margin-bottom: 8px;">
        ${sanitizedReason}. Action: Do not click links or download attachments. Verify the sender before responding.
      </div>
      <div style="font-size: 11px; color: ${style.textColor}; opacity: 0.8; margin-top: 8px;">
        Numenor Security — Automated warning
      </div>
    </div>
  `;

  // Insert banner into HTML
  let modifiedHtml = originalHtml;

  // Check if HTML has a body tag
  const bodyTagMatch = modifiedHtml.match(/<body[^>]*>/i);
  if (bodyTagMatch) {
    // Insert immediately after opening body tag
    const bodyTagEnd = bodyTagMatch.index! + bodyTagMatch[0].length;
    modifiedHtml = modifiedHtml.slice(0, bodyTagEnd) + bannerHtml + modifiedHtml.slice(bodyTagEnd);
  } else {
    // No body tag - check for html tag
    const htmlTagMatch = modifiedHtml.match(/<html[^>]*>/i);
    if (htmlTagMatch) {
      const htmlTagEnd = htmlTagMatch.index! + htmlTagMatch[0].length;
      modifiedHtml = modifiedHtml.slice(0, htmlTagEnd) + bannerHtml + modifiedHtml.slice(htmlTagEnd);
    } else {
      // No html or body tags - prepend to the string
      modifiedHtml = bannerHtml + modifiedHtml;
    }
  }

  // Generate plain-text warning
  const plainWarning = `WARNING [${riskLabel.toUpperCase()} RISK] — ${reason}${score !== null && score !== undefined ? `. Score: ${score}` : ''}\n\n`;
  const modifiedPlain = plainWarning + originalPlain;

  return {
    html: modifiedHtml,
    plain_text: modifiedPlain
  };
}
