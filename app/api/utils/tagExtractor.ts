import { stripHtmlTags } from "./emailUtils";

/**
 * Extract anchors from (X)HTML body for CTA classification
 */
export function extractAnchors(html: string): Array<{ href: string; text: string; index: number; attrs: Record<string, string> }> {
  if (!isHtmlProcessable(html)) return [];

  const anchors: Array<{ href: string; text: string; index: number; attrs: Record<string, string> }> = [];
  const anchorRegex = /<a\b([^>]+)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const [full, attrsRaw, inner] = match;
    const index = match.index ?? 0;

    const anchor = parseAnchor(attrsRaw, inner, index);
    if (anchor) anchors.push(anchor);
  }

  return anchors;
}
function isHtmlProcessable(html: string): boolean {
  if (!html) return false;

  const MAX_HTML_LENGTH = 1024 * 1024; // 1MB
  if (html.length > MAX_HTML_LENGTH) return false;

  // avoid heavy regex early
  return /<a\b/i.test(html);
}
function parseAnchor(attrsRaw: string, inner: string, index: number) {
  const href = extractHref(attrsRaw);
  if (!href) return null;

  const text = extractInnerText(inner);
  const attrs = extractAttributes(attrsRaw);

  return { href, text, index, attrs };
}
function extractHref(attrsRaw: string): string | null {
  const hrefMatch = /\bhref\s*=\s*("(.*?)"|'(.*?)'|([^\s"'<>]+))/i.exec(attrsRaw);
  const href = hrefMatch ? (hrefMatch[2] || hrefMatch[3] || hrefMatch[4]) : '';
  if (!href || !/^https?:\/\//i.test(href)) return null;
  return href.trim();
}
function extractInnerText(inner: string): string {
  const MAX_INNER_LENGTH = 10000;
  const clipped = inner.slice(0, MAX_INNER_LENGTH);

  try {
    return stripHtmlTags(clipped).replace(/\s+/g, ' ').trim();
  } catch {
    // Fallback
    return clipped.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
function extractAttributes(attrsRaw: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  const extract = (name: string, regex: RegExp) => {
    const m = regex.exec(attrsRaw);
    if (m) attrs[name] = (m[1] || m[2] || '').toLowerCase();
  };

  extract('class', /\bclass\s*=\s*"(.*?)"|\bclass\s*=\s*'(.*?)'/i);
  extract('style', /\bstyle\s*=\s*"(.*?)"|\bstyle\s*=\s*'(.*?)'/i);
  extract('role', /\brole\s*=\s*"(.*?)"|\brole\s*=\s*'(.*?)'/i);
  extract('aria', /\baria-.*?=\s*"(.*?)"|\baria-.*?=\s*'(.*?)'/i);

  return attrs;
}





