/**
 * URLExtractor
 *
 * Extracts all HTTP/HTTPS URLs from a raw text string.
 * Uses a non-greedy URI regex and strips trailing punctuation
 * that is likely not part of the URL (. , ! ? ) ] }).
 *
 * Zero React Native dependencies — pure TypeScript, testable with plain Jest.
 */

/** Regex that matches http/https URLs, including query strings and fragments. */
const URL_PATTERN =
  /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/** Characters that are commonly appended to URLs in prose but are not part of the URL. */
const TRAILING_PUNCT = /[.,!?)}\]]+$/;

export interface ExtractedURL {
  /** The raw matched URL (before any cleaning). */
  url: string;
  /** Start index of the URL in the source string. */
  start: number;
  /** End index (exclusive) of the URL in the source string. */
  end: number;
}

export const URLExtractor = {
  /**
   * Extract all URLs from `text`.
   *
   * @param text - Raw text that may contain zero or more URLs.
   * @returns An array of `ExtractedURL` objects, ordered by position.
   */
  extract(text: string): ExtractedURL[] {
    const results: ExtractedURL[] = [];
    const pattern = new RegExp(URL_PATTERN.source, URL_PATTERN.flags);
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      let url = match[0];
      let end = match.index + url.length;

      // Strip trailing punctuation characters that are not part of the URL
      const trailingMatch = url.match(TRAILING_PUNCT);
      if (trailingMatch) {
        url = url.slice(0, url.length - trailingMatch[0].length);
        end -= trailingMatch[0].length;
      }

      // Skip empty or scheme-only results after stripping
      if (url.length < 10) continue;

      results.push({
        url,
        start: match.index,
        end,
      });
    }

    return results;
  },
};
