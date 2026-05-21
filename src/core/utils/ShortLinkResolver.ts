/**
 * ShortLinkResolver
 *
 * Resolves opaque short links (e.g. share.google, t.co) to their destination
 * URLs by following HTTP redirects. This is a pre-pipeline step — the resolved
 * URL is then fed into LinkCleanPipeline for tracking parameter removal.
 *
 * Uses fetch (a global available in React Native and modern browsers).
 * No React Native imports — safe for use in src/core/.
 *
 * Browser note: most short-link domains do not set CORS headers, so fetch-based
 * resolution is only reliable in native app contexts. On the web, use
 * isShortLink() for detection and prompt the user to resolve manually.
 */

import { URLExtractor } from '../pipeline/URLExtractor';
import { URLReassembler } from '../pipeline/URLReassembler';

const DEFAULT_TIMEOUT_MS = 3000;

/** Returns true if the URL's hostname matches any domain in the list. */
export function isShortLink(url: string, domains: string[]): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((d) => hostname === d || hostname.endsWith('.' + d));
}

/**
 * Resolve a single short link URL to its destination via HTTP redirect-following.
 * Returns the original URL unchanged on timeout, network error, or CORS failure.
 */
export async function resolveOne(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
    // response.url is the final URL after following all redirects
    return res.url || url;
  } catch {
    return url;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve all short links within a block of text.
 * Extracts URLs, resolves any that match the domain list, then reassembles.
 * Non-matching URLs are passed through unchanged.
 *
 * @param text - Raw input text (may contain zero or more URLs).
 * @param domains - Plain domain list from ShortlinkLoader (e.g. ["t.co", "bit.ly"]).
 * @param timeoutMs - Per-URL resolution timeout. Use a shorter value in the
 *                    share extension (2 s) than in the main app (3 s).
 */
export async function resolveShortLinksInText(
  text: string,
  domains: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  if (domains.length === 0) return text;

  const extractions = URLExtractor.extract(text);
  if (extractions.length === 0) return text;

  const resolvedUrls = await Promise.all(
    extractions.map(({ url }) =>
      isShortLink(url, domains) ? resolveOne(url, timeoutMs) : Promise.resolve(url),
    ),
  );

  return URLReassembler.reassemble({
    originalText: text,
    extractions,
    cleanedUrls: resolvedUrls,
  });
}
