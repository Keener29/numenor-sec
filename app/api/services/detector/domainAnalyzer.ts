/**
 * Domain Analysis Utilities
 * Shared utilities for domain analysis including typosquatting and homoglyph detection
 * Used by both headerAnalyzer and linkAnalyzer
 */

import fastLevenshtein from 'fast-levenshtein';
const levenshteinDistance = fastLevenshtein.get;
import * as confusables from 'confusables';
import { analyzeDomainAge, type DomainAgeResult } from './domainAgeAnalyzer.js';

export interface DomainAnalysisResult {
  isSuspicious: boolean;
  type?: 'typosquatting' | 'homoglyph' | 'suspicious_pattern' | 'domain_age';
  similarDomain?: string;
  distance?: number;
  riskScore: number;
  domainAge?: DomainAgeResult;
}

export interface TyposquattingResult {
  isSuspicious: boolean;
  similarDomain?: string;
  distance?: number;
}

export interface HomoglyphResult {
  isSuspicious: boolean;
  similarDomain?: string;
}


/**
 * Known brand domains for comparison
 */
export const KNOWN_BRAND_DOMAINS = [
  // Tech Companies
  'google.com', 'microsoft.com', 'apple.com', 'amazon.com', 'facebook.com', 'twitter.com',
  'linkedin.com', 'instagram.com', 'youtube.com', 'netflix.com', 'spotify.com',
  
  // Financial Services
  'paypal.com', 'visa.com', 'mastercard.com', 'americanexpress.com', 'chase.com',
  'bankofamerica.com', 'wellsfargo.com', 'citibank.com', 'capitalone.com',
  
  // E-commerce
  'ebay.com', 'etsy.com', 'shopify.com', 'walmart.com', 'target.com', 'bestbuy.com',
  
  // Email Providers
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com',
  
  // Social Media
  'tiktok.com', 'snapchat.com', 'pinterest.com', 'reddit.com', 'discord.com',
  
  // Cloud Services
  'dropbox.com', 'onedrive.com', 'icloud.com', 'box.com', 'mega.nz',
  
  // Crypto/Finance
  'coinbase.com', 'binance.com', 'kraken.com', 'robinhood.com', 'stripe.com'
];

/**
 * Suspicious domain patterns (incomplete domains that look like legitimate ones)
 */
export const SUSPICIOUS_DOMAIN_PATTERNS = [
  /gmail\.co$/, /yahoo\.co$/, /outlook\.co$/, /amazon\.co$/,
  /paypal\.co$/, /apple\.co$/, /microsoft\.co$/, /google\.co$/,
  /facebook\.co$/, /twitter\.co$/, /linkedin\.co$/, /instagram\.co$/
];

/**
 * URL shortener domains
 * Known URL shorteners should not receive penalties as they are common and legitimate
 */
export const POPULAR_URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'short.link',
  'ow.ly', 'buff.ly', 'is.gd', 'v.gd', 'tiny.cc', 'rebrand.ly',
  'shorturl.at', 'cutt.ly', 'short.to', 'aka.ms'
];

/**
 * Known legitimate domains that should not be flagged as typosquatting
 * This includes legitimate URL shorteners, service domains, etc.
 */
export const LEGITIMATE_DOMAINS = [
  'office.com',
  'microsoft.com',
  'microsoftonline.com',
  'live.com',
  'outlook.com',
  'hotmail.com',
  'msn.com',
  'office365.com'
];

/**
 * Analyze a domain for various suspicious patterns
 */
export async function analyzeDomain(domain: string, businessId?: number): Promise<DomainAnalysisResult> {
  // Check for typosquatting
  const typosquattingResult = detectTyposquatting(domain);
  if (typosquattingResult.isSuspicious) {
    return {
      isSuspicious: true,
      type: 'typosquatting',
      similarDomain: typosquattingResult.similarDomain,
      distance: typosquattingResult.distance,
      riskScore: typosquattingResult.distance! <= 1 ? 40 : 25
    };
  }
  
  // Check for homoglyph attacks
  const homoglyphResult = detectHomoglyphs(domain);
  if (homoglyphResult.isSuspicious) {
    return {
      isSuspicious: true,
      type: 'homoglyph',
      similarDomain: homoglyphResult.similarDomain,
      riskScore: 35
    };
  }
  
  // Check for suspicious patterns (incomplete domains)
  if (isSuspiciousDomainPattern(domain)) {
    return {
      isSuspicious: true,
      type: 'suspicious_pattern',
      riskScore: 20
    };
  }
  
  const domainAgeResult = await analyzeDomainAge(domain, businessId);
  if (domainAgeResult.isSuspicious) {
    return {
      isSuspicious: true,
      type: 'domain_age',
      riskScore: domainAgeResult.riskScore,
      domainAge: domainAgeResult
    };
  }
  
  return {
    isSuspicious: false,
    riskScore: 0,
    domainAge: domainAgeResult
  };
}

/**
 * Extract the actual domain name from a domain string, ignoring subdomains
 * Examples:
 * - "example.com" -> "example"
 * - "mail.example.com" -> "example"
 * - "view.email.movember.com" -> "movember"
 */
function extractDomainName(domain: string): string {
  const parts = domain.toLowerCase().split('.');
  
  // If we have 2 parts (domain.com), return the first part
  if (parts.length === 2) {
    return parts[0];
  }
  
  // If we have more than 2 parts (sub.domain.com), return the second-to-last part
  // This is the actual domain name (not the subdomain)
  if (parts.length > 2) {
    return parts[parts.length - 2]; // Second-to-last part
  }
  
  // Fallback: if somehow only 1 part, return it
  return parts[0] || '';
}

/**
 * Detect typosquatting using Levenshtein distance
 */
export function detectTyposquatting(domain: string): TyposquattingResult {
  const domainLower = domain.toLowerCase();
  
  // First check if this is a known legitimate domain - skip typosquatting check
  if (LEGITIMATE_DOMAINS.some(legit => domainLower === legit || domainLower.endsWith('.' + legit))) {
    return { isSuspicious: false };
  }
  
  // Also skip if domain ends with .edu (educational institutions)
  if (domainLower.endsWith('.edu')) {
    return { isSuspicious: false };
  }
  
  // Extract the actual domain name (not subdomains)
  // For "view.email.movember.com", extract "movember" not "view"
  const domainName = extractDomainName(domain);
  
  // Skip if domain name is too short (less than 3 chars) - likely not typosquatting
  if (domainName.length < 3) {
    return { isSuspicious: false };
  }
  
  for (const brandDomain of KNOWN_BRAND_DOMAINS) {
    const brandName = extractDomainName(brandDomain);
    const distance = levenshteinDistance(domainName, brandName);
    const ratio = distance / Math.max(domainName.length, brandName.length);

    // Early exits
    if (!distance || distance > 2) continue;
    if (Math.abs(domainName.length - brandName.length) > 2) continue;
    if (domainName[0] !== brandName[0]) continue; // must start similarly
    if (ratio >= 0.34) continue; // normalized distance too big

    return {
      isSuspicious: true,
      similarDomain: brandDomain,
      distance
    };
  }

  return { isSuspicious: false };
}

/**
 * Detect homoglyph attacks using confusables library + number-to-letter substitutions
 */
export function detectHomoglyphs(domain: string): HomoglyphResult {
  const domainName = extractDomainName(domain);
  
  for (const brandDomain of KNOWN_BRAND_DOMAINS) {
    const brandName = extractDomainName(brandDomain);
    
    // Check if domains are same length and contain homoglyphs
    if (domainName.length === brandName.length) {
      // Use confusables library for Unicode homoglyphs (Cyrillic, Greek, etc.)
      const normalizedDomain = confusables.remove(domainName);
      const normalizedBrand = confusables.remove(brandName);
      
      if (normalizedDomain === normalizedBrand && domainName !== brandName) {
        return {
          isSuspicious: true,
          similarDomain: brandDomain
        };
      }
      
      // Also check for number-to-letter substitutions (confusables doesn't handle these)
      const numberSubstitutedDomain = normalizeNumberSubstitutions(domainName);
      const numberSubstitutedBrand = normalizeNumberSubstitutions(brandName);
      
      if (numberSubstitutedDomain === numberSubstitutedBrand && domainName !== brandName) {
        return {
          isSuspicious: true,
          similarDomain: brandDomain
        };
      }
    }
  }

  return { isSuspicious: false };
}

/**
 * Check if domain matches suspicious patterns
 */
export function isSuspiciousDomainPattern(domain: string): boolean {
  return SUSPICIOUS_DOMAIN_PATTERNS.some(pattern => pattern.test(domain.toLowerCase()));
}

/**
 * Check if domain appears to be a temporary or disposable email service
 */
export function isTemporaryEmailDomain(domain: string): boolean {
  const tempPatterns = [
    /temp/i,
    /disposable/i,
    /throwaway/i,
    /10minutemail/i,
    /guerrillamail/i,
    /mailinator/i,
    /tempmail/i,
    /yopmail/i,
    /sharklasers/i,
    /trashmail/i
  ];
  
  return tempPatterns.some(pattern => pattern.test(domain));
}

/**
 * Check if domain is a URL shortener
 */
export function isPopularUrlShortener(hostname: string): boolean {
  return POPULAR_URL_SHORTENERS.includes(hostname.toLowerCase());
}

/**
 * Check if hostname is an IP address
 */
export function isIPAddress(hostname: string): boolean {
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipPattern.test(hostname)) {
    return false;
  }
  
  // Validate that each octet is between 0-255
  const octets = hostname.split('.');
  for (const octet of octets) {
    const num = parseInt(octet, 10);
    if (num < 0 || num > 255) {
      return false;
    }
  }
  
  return true;
}

/**
 * Extract domain from email address or URL
 */
export function extractDomain(input: string): string | null {
  if (!input || input.trim() === '') {
    return null;
  }
  
  try {
    // If it's an email address
    if (input.includes('@')) {
      const emailMatch = input.match(/<([^>]+)>/) || [input];
      const email = emailMatch[1] || emailMatch[0];
      const parts = email.split('@');
      if (parts.length !== 2 || !parts[1]) {
        return null;
      }
      const domain = parts[1];
      return domain ? domain.toLowerCase() : null;
    }
    
    // If it's a URL
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const url = new URL(input);
      return url.hostname.toLowerCase();
    }
    
    // If it's just a domain (basic validation)
    if (input.includes('.') && !input.includes(' ')) {
      return input.toLowerCase();
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Normalize number-to-letter substitutions (1->l, 0->o, etc.)
 */
function normalizeNumberSubstitutions(text: string): string {
  return text
    .replace(/1/g, 'l')  // 1 -> l
    .replace(/0/g, 'o')  // 0 -> o
    .replace(/3/g, 'e')  // 3 -> e
    .replace(/4/g, 'a')  // 4 -> a
    .replace(/5/g, 's')  // 5 -> s
    .replace(/7/g, 't')  // 7 -> t
    .replace(/8/g, 'b')  // 8 -> b
    .replace(/9/g, 'g'); // 9 -> g
}

