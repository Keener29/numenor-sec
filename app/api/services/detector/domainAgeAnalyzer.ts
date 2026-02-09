/**
 * Domain Age Analyzer
 * Analyzes domain registration age for phishing detection
 * 
 * Phishing campaigns often use newly registered domains:
 * - 0-30 days old = very high risk (score: 50)
 * - 30-180 days = medium risk (score: 25)
 * - 180+ days = lower risk (score: 0)
 * 
 * Uses WHOIS lookup with caching to avoid rate limits
 */

import { oauthLogger } from '../../../utils/logger.js';
import { query } from '../../../db/connection.js';
import { parse } from "tldts";

type RiskLevel = 'very_high' | 'high' | 'medium' | 'low' | 'unknown';

export interface DomainAgeResult {
  isSuspicious: boolean;
  ageInDays: number | null;
  registrationDate: Date | null;
  riskScore: number;
  riskLevel: RiskLevel;
  error?: string;
}

export interface WhoisResponse {
  domain: string;
  created_date?: string;
  updated_date?: string;
  expires_date?: string;
  registrar?: string;
  status?: string;
}

// In-memory cache for WHOIS lookups (in production, use Redis)
const whoisCache = new Map<string, { data: DomainAgeResult; timestamp: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const WHOIS_APIS = [
  {
    url: 'https://whoisjson.com/api/v1/whois',
    apiKeyEnv: 'WHOIS_JSON_API_KEY',
    queryParam: 'domain'
  },
  {
    url: 'https://www.whoisxmlapi.com/whoisserver/WhoisService',
    apiKeyEnv: 'WHOIS_XML_API_KEY',
    queryParam: 'domainName'
  }
];

export async function analyzeDomainAge(domain: string, businessId?: number): Promise<DomainAgeResult> {
  try {
    const cached = getCachedResult(domain);
    if (cached) {
      oauthLogger.info(`Domain age cache hit for ${domain}`, { operation: 'domain-age-analysis', emailAddress: domain });
      return cached;
    }

    // Clean domain (remove protocol, www, etc.)
    const cleanDomain = cleanDomainName(domain);
    if (!cleanDomain) {
      return {
        isSuspicious: true,
        ageInDays: null,
        registrationDate: null,
        riskScore: 40, // High risk for malformed domains
        riskLevel: 'high',
        error: 'Invalid domain format'
      };
    }

    // Skip known trusted domains (built-in + business allowlist)
    if (await isTrustedDomain(cleanDomain, businessId)) {
      const result: DomainAgeResult = {
        isSuspicious: false,
        ageInDays: null,
        registrationDate: null,
        riskScore: 0,
        riskLevel: 'low'
      };
      cacheResult(domain, result);
      return result;
    }

    // Perform WHOIS lookup
    const whoisData = await performWhoisLookup(cleanDomain);
    if (!whoisData) {
      const result: DomainAgeResult = {
        isSuspicious: false,
        ageInDays: null,
        registrationDate: null,
        riskScore: 0,
        riskLevel: 'unknown',
        error: 'WHOIS lookup failed'
      };
      cacheResult(domain, result);
      return result;
    }

    // Calculate age and risk
    const result = calculateDomainAgeRisk(whoisData);
    
    // Cache the result
    cacheResult(domain, result);
    
    oauthLogger.info(`Domain age analysis for ${domain}: ${result.ageInDays} days, risk: ${result.riskLevel}`, { operation: 'domain-age-analysis', emailAddress: domain });
    return result;

  } catch (error) {
    oauthLogger.error(`Domain age analysis error for ${domain}`, { operation: 'domain-age-analysis', emailAddress: domain }, error instanceof Error ? error : new Error(String(error)));
    return {
      isSuspicious: false,
      ageInDays: null,
      registrationDate: null,
      riskScore: 0,
      riskLevel: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Perform WHOIS lookup using available APIs
 */
async function performWhoisLookup(domain: string): Promise<WhoisResponse | null> {
  for (const apiConfig of WHOIS_APIS) {
    try {
      const queryParam = apiConfig.queryParam;
      const apiKey = process.env[apiConfig.apiKeyEnv];
      if (!apiKey) continue;
      
      let url = `${apiConfig.url}?${queryParam}=${encodeURIComponent(domain)}`;
      
      const headers: Record<string, string> = {
        'User-Agent': 'Numenor-Detector/1.0',
        'Accept': 'application/json'
      };
      
      // Add API key to headers for WHOIS JSON API
      if (apiConfig.url.includes('whoisjson.com')) {
        headers['Authorization'] = `TOKEN=${apiKey}`;
      } else {
        // For WHOIS XML API, add as query parameter and request JSON format
        url += `&apiKey=${encodeURIComponent(apiKey)}&outputFormat=JSON`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        oauthLogger.warn(`WHOIS API ${apiConfig.url} returned ${response.status} for ${domain}`, { operation: 'domain-age-analysis', emailAddress: domain });
        continue;
      }

      const data = await response.json();
      return formatWhoisDataResponse(data, domain);
    } catch (error) {
      oauthLogger.warn(`WHOIS API ${apiConfig.url} failed for ${domain}`, { operation: 'domain-age-analysis', emailAddress: domain }, { error: (error as Error).message });
      continue;
    }
  }
  return null;
}

function formatWhoisDataResponse(data: any, domain: string): WhoisResponse | null {
  // Handle different API response formats
  let createdDate: string | undefined;
  let updatedDate: string | undefined;
  let expiresDate: string | undefined;
  let registrar: string | undefined;
  let status: string | undefined;
  
  if (data?.WhoisRecord) {
    // WHOIS XML API format
    const whoisRecord = data.WhoisRecord;
    createdDate = whoisRecord.createdDate;
    updatedDate = whoisRecord.updatedDate;
    expiresDate = whoisRecord.expiresDate;
    registrar = whoisRecord.registrar?.name;
    status = whoisRecord.status;
  } else if (data && (data.created_date || data.creation_date || data.registered_date)) {
    // WHOIS JSON API format
    createdDate = data.created_date || data.creation_date || data.registered_date;
    updatedDate = data.updated_date || data.last_updated;
    expiresDate = data.expires_date || data.expiration_date;
    registrar = data.registrar;
    status = data.status;
  }
  
  if (createdDate) {
    return {
      domain: data.domain || domain,
      created_date: createdDate,
      updated_date: updatedDate,
      expires_date: expiresDate,
      registrar: registrar,
      status: status
    };
  }
  return null;
}

/**
 * Calculate domain age and risk score
 */
function calculateDomainAgeRisk(whoisData: WhoisResponse): DomainAgeResult {
  const registrationDate = parseRegistrationDate(whoisData.created_date);
  
  if (!registrationDate) {
    return {
      isSuspicious: false,
      ageInDays: null,
      registrationDate: null,
      riskScore: 0,
      riskLevel: 'unknown',
      error: 'Could not parse registration date'
    };
  }

  const now = new Date();
  const ageInDays = Math.floor((now.getTime() - registrationDate.getTime()) / (1000 * 60 * 60 * 24));

  let riskScore: number;
  let riskLevel: RiskLevel;
  let isSuspicious: boolean;

  if (ageInDays < 7) {
    riskScore = 40;
    riskLevel = 'very_high';
    isSuspicious = true;
  } else if (ageInDays < 30) {
    riskScore = 20;
    riskLevel = 'high';
    isSuspicious = true;
  } else {
    riskScore = 0;
    riskLevel = 'low';
    isSuspicious = false;
  }

  return {
    isSuspicious,
    ageInDays,
    registrationDate,
    riskScore,
    riskLevel
  };
}

/**
 * Parse registration date from various formats
 */
function parseRegistrationDate(dateString: string | undefined): Date | null {
  if (!dateString) return null;

  try {
    // Try parsing as ISO date
    const date = new Date(dateString);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }

    // Try parsing common WHOIS date formats
    const formats = [
      /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
      /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
      /(\d{2})-(\d{2})-(\d{4})/, // MM-DD-YYYY
      /(\d{4})\/(\d{2})\/(\d{2})/, // YYYY/MM/DD
    ];

    for (const format of formats) {
      const match = format.exec(dateString);
      if (match) {
        const [, year, month, day] = match;
        const parsedDate = new Date(Number.parseInt(year), Number.parseInt(month) - 1, Number.parseInt(day));
        if (!Number.isNaN(parsedDate.getTime())) {
          return parsedDate;
        }
      }
    }

    return null;
  } catch (error) {
    oauthLogger.warn(`Failed to parse date: ${dateString}`, { operation: 'domain-age-analysis' }, { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Clean domain name for WHOIS lookup
 */
function cleanDomainName(input: string): string | null {
  try {
    const parsed = parse(input);
    if (!parsed.domain) return null; // No valid domain found
    return parsed.domain.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check if domain is a known trusted domain (skip age analysis)
 */
export function isKnownTrustedDomain(domain: string): boolean {
  const trustedDomains = [
    // Internal systems (always safe)
    'localhost', '127.0.0.1', 'numenorsecurity.com',
    
    // Major email providers
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com',
    'icloud.com', 'zoho.com',
    
    // Major tech companies
    'google.com', 'microsoft.com', 'apple.com', 'amazon.com', 'facebook.com',
    'twitter.com', 'linkedin.com', 'instagram.com', 'youtube.com', 
    'youtu.be', 'grammarly.com', 'mailsuite.com',
    'slack.com', 'zoom.us', 'discord.com', 'pinterest.com', 'reddit.com', 
    'tiktok.com', 'spotify.com', 'shopify.com', 'fitbit.com', 'crave.ca',
    
    // Major financial institutions
    'paypal.com', 'visa.com', 'mastercard.com', 'americanexpress.com',
    'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citibank.com',
    'questrade.com', 'robinhood.com', 'wealthsimple.com',

    // Banks
    'bankofamerica.com', 'wellsfargo.com', 'citibank.com',
    'chase.com', 'td.com', 'scotiabank.com', 'cibc.com', 
    'bmo.com', 'rbc.com',
    
    // Government domains
    'gov', 'mil', 'edu',
    
    // Major cloud providers
    'aws.amazon.com', 'azure.microsoft.com', 'cloud.google.com',

    // Extra
    'boxd.it', 'opentable.com'
  ];

  return trustedDomains.some(trusted => 
    domain === trusted || domain.endsWith('.' + trusted)
  );
}

/**
 * Check if domain is trusted (built-in + business allowlist)
 */
export async function isTrustedDomain(domain: string, businessId?: number): Promise<boolean> {
  // First check built-in trusted domains
  if (isKnownTrustedDomain(domain)) {
    return true;
  }

  // Check if domain matches any monitored email domain for this business
  if (businessId) {
    try {
      const result = await query(
        `SELECT COUNT(*) as count 
         FROM monitored_emails 
         WHERE business_id = $1 
         AND LOWER(SUBSTRING(email_address FROM '@(.*)$')) = $2`,
        [businessId, domain]
      );

      const count = Number.parseInt((result.rows[0] as { count: string }).count);
      return count > 0;
    } catch (error) {
      oauthLogger.error('Failed to check monitored email domains for domain age analysis', {
        operation: 'check-monitored-domains',
        emailAddress: domain,
        metadata: { businessId, domain }
      }, error as Error);
    }
  }

  return false;
}

/**
 * Get cached result if available and not expired
 */
function getCachedResult(domain: string): DomainAgeResult | null {
  const cached = whoisCache.get(domain);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

/**
 * Cache result for future use
 */
function cacheResult(domain: string, result: DomainAgeResult): void {
  whoisCache.set(domain, {
    data: result,
    timestamp: Date.now()
  });
  
  // Clean up old cache entries periodically
  if (whoisCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of whoisCache.entries()) {
      if ((now - value.timestamp) > CACHE_DURATION) {
        whoisCache.delete(key);
      }
    }
  }
}

/**
 * Clear cache (useful for testing)
 */
export function clearDomainAgeCache(): void {
  whoisCache.clear();
}

/**
 * Analyze domain age for sender domains (lower scoring)
 * Uses lower scoring: +10 if < 30 days old
 */
export async function analyzeSenderDomainAge(domain: string, businessId?: number): Promise<DomainAgeResult> {
  try {
    // Check cache first
    const cached = getCachedResult(domain);
    if (cached) {
      // Adjust the cached result for sender domain scoring
      const adjustedResult = adjustResultForSenderDomain(cached);
      oauthLogger.info(`Sender domain age cache hit for ${domain}`, { operation: 'sender-domain-age-analysis', emailAddress: domain });
      return adjustedResult;
    }

    // Clean domain (remove protocol, www, etc.)
    const cleanDomain = cleanDomainName(domain);
    if (!cleanDomain) {
      return {
        isSuspicious: true,
        ageInDays: null,
        registrationDate: null,
        riskScore: 40,
        riskLevel: 'high',
        error: 'Invalid domain format'
      };
    }

    // Skip known trusted domains (built-in + business allowlist)
    if (await isTrustedDomain(cleanDomain, businessId)) {
      const result: DomainAgeResult = {
        isSuspicious: false,
        ageInDays: null,
        registrationDate: null,
        riskScore: 0,
        riskLevel: 'low'
      };
      cacheResult(domain, result);
      return result;
    }

    // Perform WHOIS lookup
    const whoisData = await performWhoisLookup(cleanDomain);
    if (!whoisData || whoisData.status === '401') {
      const result: DomainAgeResult = {
        isSuspicious: false,
        ageInDays: null,
        registrationDate: null,
        riskScore: 0,
        riskLevel: 'unknown',
        error: 'WHOIS lookup failed'
      };
      cacheResult(domain, result);
      return result;
    }

    // Calculate age and risk with sender domain scoring
    const result = calculateSenderDomainAgeRisk(whoisData);
    
    // Cache the result
    cacheResult(domain, result);
    
    oauthLogger.info(`Sender domain age analysis for ${domain}: ${result.ageInDays} days, risk: ${result.riskLevel}`, { operation: 'sender-domain-age-analysis', emailAddress: domain });
    return result;

  } catch (error) {
    oauthLogger.error(`Sender domain age analysis error for ${domain}`, { operation: 'sender-domain-age-analysis', emailAddress: domain }, error instanceof Error ? error : new Error(String(error)));
    return {
      isSuspicious: false,
      ageInDays: null,
      registrationDate: null,
      riskScore: 0,
      riskLevel: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Adjust cached result for sender domain scoring
 */
function adjustResultForSenderDomain(cachedResult: DomainAgeResult): DomainAgeResult {
  if (!cachedResult.ageInDays) {
    return cachedResult;
  }

  let riskScore: number;
  let riskLevel: RiskLevel;
  let isSuspicious: boolean;

  if (cachedResult.ageInDays < 30) {
    riskScore = 20;
    riskLevel = 'medium';
    isSuspicious = true;
  } else {
    riskScore = 0;
    riskLevel = 'low';
    isSuspicious = false;
  }

  return {
    ...cachedResult,
    riskScore,
    riskLevel,
    isSuspicious
  };
}

/**
 * Calculate domain age and risk score for sender domains (lower scoring)
 */
function calculateSenderDomainAgeRisk(whoisData: WhoisResponse): DomainAgeResult {
  const registrationDate = parseRegistrationDate(whoisData.created_date);
  
  if (!registrationDate) {
    return {
      isSuspicious: false,
      ageInDays: null,
      registrationDate: null,
      riskScore: 0,
      riskLevel: 'unknown',
      error: 'Could not parse registration date'
    };
  }

  const now = new Date();
  const ageInDays = Math.floor((now.getTime() - registrationDate.getTime()) / (1000 * 60 * 60 * 24));

  let riskScore: number;
  let riskLevel: RiskLevel;
  let isSuspicious: boolean;

  if (ageInDays < 30) {
    riskScore = 20;
    riskLevel = 'medium';
    isSuspicious = true;
  } else {
    riskScore = 0;
    riskLevel = 'low';
    isSuspicious = false;
  }

  return {
    isSuspicious,
    ageInDays,
    registrationDate,
    riskScore,
    riskLevel
  };
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: whoisCache.size,
    entries: Array.from(whoisCache.keys())
  };
}
