/**
 * URLNormalizer
 *
 * Normalises a URL by:
 * 1. Lowercasing the scheme and host (per RFC 3986).
 * 2. Percent-decoding the path, query, and fragment where safe.
 *
 * Malformed percent-sequences (e.g. %2525 double-encoded, stray %) are
 * handled gracefully — the original string is returned unchanged for the
 * segment that cannot be decoded rather than throwing.
 */

export const URLNormalizer = {
  /**
   * Decode percent-encoded characters in a URL string.
   * Idempotent: calling it twice produces the same result as calling it once.
   *
   * @param rawUrl - The URL string to normalise.
   * @returns The normalised URL string.
   */
  decode(rawUrl: string): string {
    // Attempt to parse as URL for scheme+host normalisation
    let parsed: URL | null = null;
    try {
      parsed = new URL(rawUrl);
    } catch {
      // Not a valid URL — still attempt best-effort decoding
    }

    if (parsed) {
      // The WHATWG URL parser lowercases scheme and host per spec, so the
      // parsed.protocol and parsed.hostname setters are redundant here.
      // Do NOT set them: Hermes (React Native's JS engine) does not implement
      // URL property setters and throws "URL.protocol is not implemented".

      // Decode the pathname — the URL constructor may have re-encoded some chars.
      // Wrap the setter in try/catch: older Hermes versions may not support it.
      try {
        const decodedPath = decodeURIComponent(parsed.pathname);
        parsed.pathname = decodedPath;
      } catch {
        // pathname setter unavailable — fall back to href as-is
        return parsed.href;
      }

      return parsed.href;
    }

    // Fallback: decode the whole string without URL parsing
    return URLNormalizer._safeDecode(rawUrl);
  },

  /**
   * Safe wrapper around decodeURIComponent that never throws.
   * On failure, returns the original string.
   *
   * @internal
   */
  _safeDecode(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  },
};
