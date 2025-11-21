/**
 * Link Analyzer Service
 * Analyzes URLs and links in emails for phishing indicators
 * 
 * Features:
 * - URL shortener detection
 * - Suspicious domain analysis (typosquatting, homoglyphs)
 * - IP address detection in URLs
 * - Protocol security analysis (HTTP vs HTTPS)
 * - Malformed URL detection
 * - Redirect chain analysis
 */

import {
  analyzeDomain,
  isPopularUrlShortener,
  isIPAddress,
  type DomainAnalysisResult
} from './domainAnalyzer.js';
import { isTrustedDomain } from './domainAgeAnalyzer.js';
import { parse } from 'tldts';
import { extractAnchors } from '../../utils/tagExtractor.js';

export interface LinkAnalysis {
  risks: string[];
  score: number;
  suspiciousLinks: string[];
  totalLinks: number;
}

const KNOWN_SAFE_HTTP_DOMAINS = [
  'w3.org',             // HTML DTDs
  'akamai.net',
  'cloudfront.net',
  'mailchimp.com',
  'mandrillapp.com',
  'sendgrid.net',
  'acemsr.aircanada.com', // add real ESP/CDN hosts you see
  'res.mail.aircanada.com'
];
// Namespace / spec URLs (not real links)
const SAFE_NAMESPACE_PREFIXES = [
  "http://www.w3.org/",
  "https://www.w3.org/",
  "http://schemas.microsoft.com/",
  "http://xml.apache.org/",
  "http://purl.org/", // RDF vocabularies
];
/**
 * Link Analyzer Service
 */
export class LinkAnalyzerService {

  private isImageLink(link: string): boolean {
    return /\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(link);
  }

  private isClickAction(anchor: string): boolean {
    return /(click|login|reset|verify|update|account|confirm)/i.test(anchor);
  }

  private isNamespaceURL(urlString: string): boolean {
    return SAFE_NAMESPACE_PREFIXES.some(prefix => urlString.startsWith(prefix));
  }
  private linkRisks: string[] = [];
  /**
   * Analyze all links in an email
   */
  async analyzeLinks(links: string[], businessId?: number, emailBody?: string): Promise<LinkAnalysis> {
    this.linkRisks = [];
    const suspiciousLinks: string[] = [];
    let totalScore = 0;

    // Determine which links are primary CTAs to evaluate
    const ctaLinks = this.getCtaLinkSet(links, emailBody);

    // Extract unique domains to avoid redundant domain analysis
    const domainAnalysisCache = new Map<string, { domainAnalysis?: DomainAnalysisResult; trustedDomain: boolean }>();
    const uniqueDomains = this.extractUniqueDomains(links, ctaLinks);

    await this.preAnalyzeDomains(uniqueDomains, domainAnalysisCache, businessId);

    // Second pass: analyze each link using cached domain analysis
    for (const link of links) {
      // Only score main CTA links; ignore secondary/footer/inline links
      if (!ctaLinks.has(this.normalize(link))) {
        continue;
      }
      const score = await this.analyzeSingleLink(link, domainAnalysisCache);

      if (this.linkRisks.length > 0) {
        suspiciousLinks.push(link);
        totalScore += score;
      }
    }

    return {
      risks: this.linkRisks,
      score: totalScore,
      suspiciousLinks,
      totalLinks: links.length
    };
  }

  private async preAnalyzeDomains(uniqueDomains: Set<string>, domainAnalysisCache: Map<string, { domainAnalysis?: DomainAnalysisResult; trustedDomain: boolean }>, businessId?: number) {
    for (const domain of uniqueDomains) {
      const trustedDomain = await isTrustedDomain(domain, businessId);
      let domainAnalysis: DomainAnalysisResult | undefined;

      if (!trustedDomain) {
        domainAnalysis = await analyzeDomain(domain, businessId);
      }
      domainAnalysisCache.set(domain, { domainAnalysis, trustedDomain });
    }
  }

  private extractUniqueDomains(links: string[], ctaLinks: Set<string>): Set<string> {
    const uniqueDomains = new Set<string>();
    // First pass: extract unique domains from all links
    for (const link of links) {
      // Skip non-CTA (secondary) links entirely
      if (!ctaLinks.has(this.normalize(link))) continue;
      try {
        const url = new URL(link);
        uniqueDomains.add(url.hostname);
      } catch {
        // Invalid URL, will be handled in analyzeSingleLink
      }
    }
    return uniqueDomains;
  }

  private isInFooterRegion(anchorIndex: number, html: string, lowerHtml: string): boolean {
    const upto = html.slice(0, anchorIndex);
    const lowerUpto = lowerHtml.slice(0, anchorIndex);
    const lastOpenFooter = lowerUpto.lastIndexOf('<footer');
    const lastCloseFooter = lowerUpto.lastIndexOf('</footer>');
    if (lastOpenFooter !== -1 && lastOpenFooter > lastCloseFooter) {
      return true;
    }
    const containerRegex = /<([a-z0-9]+)\b[^>]*?(?:id|class)\s*=\s*(?:"[^"]*\bfooter\b[^"]*"|'[^']*\bfooter\b[^']*')/ig;
    let match: RegExpExecArray | null;
    let lastTagName: string | null = null;
    let lastTagIndex = -1;
    while ((match = containerRegex.exec(upto)) !== null) {
      lastTagName = (match[1] || '').toLowerCase();
      lastTagIndex = match.index;
    }
    if (lastTagName && lastTagIndex >= 0) {
      const between = html.slice(lastTagIndex, anchorIndex);
      const closeRe = new RegExp(`</\\s*${lastTagName}\\s*>`, 'i');
      if (!closeRe.test(between)) {
        return true;
      }
    }
    return false;
  }

  private readonly normalize = (url: string): string => {
    try {
      const u = new URL(url);
      // Strip tracking params often used in legit CTAs
      u.searchParams.delete('utm_source');
      u.searchParams.delete('utm_medium');
      u.searchParams.delete('ref');
      u.searchParams.delete('trk');
      u.searchParams.delete('tracking');
      u.searchParams.delete('mc_cid');
      u.searchParams.delete('mc_eid');
      return u.toString();
    } catch {
      return url;
    }
  };

  /**
   * Decide which links to score as main CTAs.
   * Heuristics: button-like classes/styles, CTA keywords in text, login/reset-like URL, and non-footer placement.
   * Also select the only login/reset-like link if unique.
   */
  private getCtaLinkSet(links: string[], emailBody?: string): Set<string> {
    // Fallback: if we can't parse, choose links that look like action/login/reset; otherwise none.
    const fallbackLoginLike = (urlString: string): boolean => {
      try {
        const url = new URL(urlString);
        const path = `${url.pathname}${url.search}`.toLowerCase();
        return /(login|signin|account|verify|confirm|update|security|password|reset)/i.test(path);
      } catch {
        return false;
      }
    };

    if (!emailBody) {
      const onlyLoginLike = links.filter(fallbackLoginLike);
      if (onlyLoginLike.length === 1) return new Set(onlyLoginLike.map(l => this.normalize(l)));
      // If multiple, prefer none rather than over-penalizing
      return new Set<string>();
    }

    const anchors = extractAnchors(emailBody);
    if (anchors.length === 0) {
      const onlyLoginLike = links.filter(fallbackLoginLike);
      if (onlyLoginLike.length === 1) return new Set(onlyLoginLike.map(l => this.normalize(l)));
      return new Set<string>();
    }
    // Add: single link auto-CTA
    if (anchors.length === 1 && anchors[0].index < emailBody.length * 0.7) {
      return new Set([this.normalize(anchors[0].href)]);
    }

    const totalLen = emailBody.length || 1;
    const lowerHtml = emailBody.toLowerCase();
    const footerThreshold = Math.floor(totalLen * 0.7);

    const secondaryText = /\b(unsubscribe|privacy|terms|view in browser|view online|help|support|contact|preferences|settings|facebook|twitter|instagram|linkedin|play store|app store|apple|google play|powered by|©)\b/i;
    const ctaText = /\b(reset|verify|confirm|activate|update|unlock|approve|review|pay|open|continue|sign in|log in|login|view account|complete setup|action required)\b/i;

    const scoreAnchor = (a: { href: string; text: string; index: number; attrs: Record<string, string> }): number => {
      let score = 0;
      const text = (a.text || '').toLowerCase();
      const classes = (a.attrs.class || '');
      const style = (a.attrs.style || '');
      const role = (a.attrs.role || '');

      // Button-like indicators
      if (/\b(btn|button|primary|cta)\b/.test(classes)) score += 2;
      if (/background-color|border-radius|padding/.test(style)) score += 1;
      if (role === 'button') score += 2;

      // CTA text keywords
      if (ctaText.test(text)) score += 2;

      // URL looks like action
      if (fallbackLoginLike(this.normalize(a.href))) score += 1;

      // Footer/secondary demotion
      if (a.index >= footerThreshold) score -= 2;
      if (this.isInFooterRegion(a.index, emailBody, lowerHtml)) score -= 4;
      if (secondaryText.test(text)) score -= 3;

      return score;
    };

    // Pre-normalize input links for reliable matching
    const normalizedLinksSet = new Set(links.map(l => this.normalize(l)));

    // Score anchors and pick likely CTAs
    const scored = anchors
      .filter(a => normalizedLinksSet.has(this.normalize(a.href))) // limit to provided links list
      .map(a => ({ href: this.normalize(a.href), score: scoreAnchor(a) }));

    const ctaCandidates = scored.filter(s => s.score >= 2).map(s => s.href);

    // If none scored as CTA, but there's exactly one login/reset-like link, choose it.
    if (ctaCandidates.length === 0) {
      const loginLike = anchors.filter(a => fallbackLoginLike(a.href)).map(a => this.normalize(a.href));
      const uniqueLoginLike = Array.from(new Set(loginLike));
      if (uniqueLoginLike.length === 1) {
        return new Set<string>(uniqueLoginLike);
      }
    }

    return new Set<string>(ctaCandidates);
  }

  /**
   * Analyze a single link
   */
  private async analyzeSingleLink(
    link: string,
    domainCache: Map<string, { domainAnalysis?: DomainAnalysisResult; trustedDomain: boolean }>
  ): Promise<number> {
    let score = 0;
    let hostname: string | undefined;

    try {
      const url = new URL(link);
      hostname = url.hostname;

      // Namespace / DTD / schema links ≡ ignore entirely
      const isNamespaceURL = this.isNamespaceURL(link);
      if (isNamespaceURL) {
        return 0;
      }

      // Get domain analysis from cache if available, otherwise fetch it
      const cached = domainCache.get(hostname);
      if (!cached) {
        throw new Error(`Domain analysis not found for ${hostname}`);
      }
      const trustedDomain = cached.trustedDomain;
      const domainAnalysis = cached.domainAnalysis;


      // Check for URL shorteners
      // Popular URL shorteners should be detected but receive minimal penalty
      if (isPopularUrlShortener(hostname)) {
        this.linkRisks.push(`URL shortener detected: ${hostname}, small penalty`);
        score += 2; // Small penalty for popular URL shorteners
      }

      // Check for IP addresses in URLs (VERY suspicious)
      if (isIPAddress(hostname)) {
        this.linkRisks.push(`IP address in URL: ${hostname}`);
        score += 35;
      }

      score += this.checkHttpLink(url, trustedDomain, link);

      // Use cached domain analysis
      if (domainAnalysis?.isSuspicious) {
        this.classifySuspiciousLink(domainAnalysis, hostname);
        score += domainAnalysis.riskScore;
      }

      // Check for suspicious URL patterns
      score += this.checkUrlPatterns(url, trustedDomain);
    } catch (error) {
      this.linkRisks.push(`Malformed URL: ${link} with error: ${error}`);
      score += 3;
    }

    return score;
  }

  private classifySuspiciousLink(domainAnalysis: DomainAnalysisResult, hostname: string) {
    for (const type of domainAnalysis.types) {
      switch (type) {
        case 'typosquatting':
          this.linkRisks.push(`Typosquatting detected: "${hostname}" is similar to "${domainAnalysis.similarDomain}" (distance: ${domainAnalysis.distance})`);
          break;
        case 'homoglyph':
          this.linkRisks.push(`Homoglyph attack detected: "${hostname}" contains visually similar characters to "${domainAnalysis.similarDomain}"`);
          break;
        case 'suspicious_pattern':
          this.linkRisks.push(`Suspicious domain pattern: "${hostname}"`);
          break;
        case 'domain_age':{
          const ageText = domainAnalysis.domainAge?.ageInDays
            ? `${domainAnalysis.domainAge?.ageInDays ?? 0} days old`
            : 'unknown age';
          this.linkRisks.push(`Newly registered domain: "${hostname}" (${ageText}, risk: ${domainAnalysis.domainAge?.riskLevel})`);
          break;
        }
      }
    }
  }

  private checkHttpLink(url: URL, trustedDomain: boolean, link: string): number {
    let score = 0;
    // Allow safe HTTP domains (legacy CDNs / W3C / ESPs)
    const isKnownSafeHttp =
      url.protocol === "http:" &&
      url.hostname !== undefined &&
      KNOWN_SAFE_HTTP_DOMAINS.some(d => url.hostname!.endsWith(d));

    if (url.protocol === "http:") {
      if (isKnownSafeHttp && this.isImageLink(link)) {
        // fine, legit email vendors do this
      }
      else if (this.isImageLink(link) && !trustedDomain) {
        this.linkRisks.push(`HTTP image asset: ${url.hostname}`);
        score += 2; // tiny penalty  -  not ideal, but common
      }
      else if (this.isClickAction(link) && !trustedDomain) {
        this.linkRisks.push(`Insecure HTTP link to action on untrusted domain: ${link}`);
        score += 30; // serious  -  login/reset over HTTP is bad
      }
      else if (!trustedDomain) {
        this.linkRisks.push(`Insecure HTTP link on untrusted domain: ${link}`);
        score += 15; // general penalty
      }
    }
    return score;
  }

  private checkUrlPatterns(url: URL, trustedDomain: boolean): number {
    let score = 0;
    score += this.checkSuspiciousPath(url, trustedDomain);
    score += this.checkSuspiciousQueryParameters(url, trustedDomain);
    score += this.checkExcessiveSubdomains(url, trustedDomain);

    if (trustedDomain) {
      return score;
    }
    score += this.checkStructuralChecks(url);
    score += this.checkRepetition(url);
    score += this.checkSuspiciousTLD(url);
    return score;
  }

  private checkSuspiciousPath(url: URL, trustedDomain: boolean): number {
    let score = 0;
    // Check for suspicious path patterns
    const suspiciousPaths = [
      /\/login/i, /\/signin/i, /\/account/i, /\/verify/i, /\/confirm/i,
      /\/update/i, /\/security/i, /\/password/i, /\/reset/i
    ];

    const pathScore = suspiciousPaths.some(p => p.test(url.pathname)) ? 5 : 0;

    if (pathScore > 0) {
      this.linkRisks.push(`Suspicious URL path: ${url.pathname}`);
      score += pathScore;

      // Extra penalty ONLY if domain looks off
      if (!trustedDomain) {
        score += 10;
        this.linkRisks.push("Suspicious login-like path on untrusted domain");
      }
    }
    return score;
  }
  private checkSuspiciousQueryParameters(url: URL, trustedDomain: boolean): number {
    let score = 0;
    const suspiciousParams = ['password', 'pwd', 'pass', 'secret'];


    const hasSuspiciousParams = suspiciousParams.some(param =>
      url.searchParams.has(param) || url.search.includes(`${param}=`)
    );

    if (hasSuspiciousParams) {
      // Mild base suspicion
      score += 3;

      // If domain is not recognized as legit, increase penalty
      if (!trustedDomain) {
        score += 50;
        this.linkRisks.push(`Credential-like params on untrusted domain: ${url.search}`);
      } else {
        this.linkRisks.push(`Suspicious query parameters on trusted domain: ${url.search}`);
      }
    }

    return score;
  }

  private checkExcessiveSubdomains(url: URL, trustedDomain: boolean): number {
    let score = 0;
    const info = parse(url.hostname);
    const subdomain = info.subdomain || '';
    // Count labels in subdomain
    const subLabels = subdomain ? subdomain.split('.').filter(Boolean) : [];
    const subdomainCount = subLabels.length;

    if (subdomainCount > 5) {
      this.linkRisks.push(`Very excessive subdomains: ${url.hostname} (count=${subdomainCount})`);
      score += trustedDomain ? 25 : 5;
    } else if (subdomainCount > 3) {
      this.linkRisks.push(`Excessive subdomains: ${url.hostname} (count=${subdomainCount})`);
      score += trustedDomain ? 10 : 2;
    }
    return score;
  }
  private checkStructuralChecks(url: URL): number {
    let score = 0;
    // Structural checks
    const labels = url.hostname.split('.').filter(Boolean);
    for (const label of labels) {
      if (label.length > 63) {
        this.linkRisks.push(`Label too long (${label.length}): ${label}`);
        score += 30;
      }
      if (/^xn--/.test(label)) {
        this.linkRisks.push(`Punycode label detected: ${label}`);
        score += 15;
      }
      if (/^-|-$/.test(label)) {
        this.linkRisks.push(`Suspicious leading/trailing hyphen in label: ${label}`);
        score += 10;
      }
      if (/^[0-9]+$/.test(label)) {
        // numeric-only label
        score += 2;
      }
    }
    // Total length
    if (url.hostname.length > 253) {
      this.linkRisks.push(`Hostname too long: ${url.hostname.length} chars`);
      score += 50;
    }
    return score;
  }
  private checkRepetition(url: URL): number {
    let score = 0;
    // Repetition / gibberish heuristic
    // Use /([^-]+-)\1/ instead of /(.*-)\1/ to prevent ReDoS (requires at least one non-hyphen char)
    // Domain labels are already limited to 63 chars, so this is safe
    const repeats = url.hostname.split('.').filter(Boolean).some(l => {
      // Check for repeated pattern ending with hyphen (e.g., "abc-abc-")
      if (/([^-]+-)\1/.test(l)) return true;
      // Check for same character repeated 6+ times (e.g., "aaaaaa")
      if (/(.)\1{6,}/.test(l)) return true;
      return false;
    });
    if (repeats) {
      this.linkRisks.push('Repeated/gibberish label detected');
      score += 15;
    }
    return score;
  }
  private checkSuspiciousTLD(url: URL): number {
    let score = 0;
    const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.click', '.download'];
    const tld = url.hostname.split('.').pop()?.toLowerCase();
    if (tld && suspiciousTlds.includes(`.${tld}`)) {
      this.linkRisks.push(`Suspicious TLD: .${tld}`);
      score += 15;
    }
    return score;
  }
  /**
   * Generate recommendations based on link analysis
   */
  generateLinkRecommendations(analysis: LinkAnalysis): string[] {
    const recommendations: string[] = [];

    if (analysis.suspiciousLinks.length > 0) {
      recommendations.push(`CRITICAL: ${analysis.suspiciousLinks.length} suspicious link(s) detected - do not click`);
    }

    if (analysis.risks.some(risk => risk.includes('URL shortener'))) {
      recommendations.push('Avoid clicking shortened URLs - use a URL expander to check destination');
    }

    if (analysis.risks.some(risk => risk.includes('IP address'))) {
      recommendations.push('IP addresses in URLs are suspicious - verify the destination');
    }

    if (analysis.risks.some(risk => risk.includes('HTTP link'))) {
      recommendations.push('Insecure HTTP links detected - avoid entering sensitive information');
    }

    if (analysis.risks.some(risk => risk.includes('Typosquatting'))) {
      recommendations.push('CRITICAL: Typosquatting detected - domain is very similar to a known brand, likely phishing attempt');
    }

    if (analysis.risks.some(risk => risk.includes('Homoglyph attack'))) {
      recommendations.push('CRITICAL: Homoglyph attack detected - domain uses visually similar characters to impersonate a brand');
    }

    if (analysis.risks.some(risk => risk.includes('Suspicious URL path'))) {
      recommendations.push('Suspicious URL path detected - be cautious of login/account pages');
    }

    if (analysis.risks.some(risk => risk.includes('query parameters'))) {
      recommendations.push('Suspicious query parameters detected - avoid entering credentials');
    }

    return recommendations;
  }
}

// Export singleton instance
export const linkAnalyzerService = new LinkAnalyzerService();
