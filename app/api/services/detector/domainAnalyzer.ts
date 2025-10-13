/**
 * Domain Analysis Utilities
 * Shared utilities for domain analysis including typosquatting and homoglyph detection
 * Used by both headerAnalyzer and linkAnalyzer
 */

import { get as levenshteinDistance } from 'fast-levenshtein';
import * as confusables from 'confusables';

export interface DomainAnalysisResult {
  isSuspicious: boolean;
  type?: 'typosquatting' | 'homoglyph' | 'suspicious_pattern';
  similarDomain?: string;
  distance?: number;
  riskScore: number;
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
 */
export const URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'short.link',
  'ow.ly', 'buff.ly', 'is.gd', 'v.gd', 'tiny.cc', 'rebrand.ly',
  'shorturl.at', 'cutt.ly', 'short.to', 'tiny.cc'
];

/**
 * Analyze a domain for various suspicious patterns
 */
export function analyzeDomain(domain: string): DomainAnalysisResult {
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
  
  return {
    isSuspicious: false,
    riskScore: 0
  };
}

/**
 * Detect typosquatting using Levenshtein distance
 */
export function detectTyposquatting(domain: string): TyposquattingResult {
  const domainWithoutTld = domain.split('.')[0].toLowerCase();
  
  for (const brandDomain of KNOWN_BRAND_DOMAINS) {
    const brandWithoutTld = brandDomain.split('.')[0];
    const distance = levenshteinDistance(domainWithoutTld.toLowerCase(), brandWithoutTld.toLowerCase());
    
    // Consider suspicious if distance is 1-2 and domains are reasonably similar length
    // But don't flag exact matches or domains that are too different
    if (distance > 0 && distance <= 2 && Math.abs(domainWithoutTld.length - brandWithoutTld.length) <= 2) {
      return {
        isSuspicious: true,
        similarDomain: brandDomain,
        distance
      };
    }
  }

  return { isSuspicious: false };
}

/**
 * Detect homoglyph attacks using confusables library + number-to-letter substitutions
 */
export function detectHomoglyphs(domain: string): HomoglyphResult {
  const domainWithoutTld = domain.split('.')[0].toLowerCase();
  
  for (const brandDomain of KNOWN_BRAND_DOMAINS) {
    const brandWithoutTld = brandDomain.split('.')[0].toLowerCase();
    
    // Check if domains are same length and contain homoglyphs
    if (domainWithoutTld.length === brandWithoutTld.length) {
      // Use confusables library for Unicode homoglyphs (Cyrillic, Greek, etc.)
      const normalizedDomain = confusables.default(domainWithoutTld);
      const normalizedBrand = confusables.default(brandWithoutTld);
      
      if (normalizedDomain === normalizedBrand && domainWithoutTld !== brandWithoutTld) {
        return {
          isSuspicious: true,
          similarDomain: brandDomain
        };
      }
      
      // Also check for number-to-letter substitutions (confusables doesn't handle these)
      const numberSubstitutedDomain = normalizeNumberSubstitutions(domainWithoutTld);
      const numberSubstitutedBrand = normalizeNumberSubstitutions(brandWithoutTld);
      
      if (numberSubstitutedDomain === numberSubstitutedBrand && domainWithoutTld !== brandWithoutTld) {
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
export function isUrlShortener(hostname: string): boolean {
  return URL_SHORTENERS.includes(hostname.toLowerCase());
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

