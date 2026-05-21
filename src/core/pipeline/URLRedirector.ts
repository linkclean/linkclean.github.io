/**
 * URLRedirector
 *
 * Unwraps URLs that embed their real destination as a capture group inside
 * a tracker/wrapper URL. Examples:
 *   https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2F&h=...
 *   https://out.reddit.com/t3_xyz?url=https%3A%2F%2Fexample.com%2F
 *
 * Each redirection pattern must contain ONE capture group holding the
 * (typically percent-encoded) target URL. The decoded capture replaces the
 * input URL; the pipeline re-enters from URLNormalizer so subsequent stages
 * can clean the unwrapped target.
 *
 * Loop prevention: callers track the hop count and cap at MAX_HOPS to
 * avoid chains crafted to cause infinite recursion.
 */

export const MAX_REDIRECT_HOPS = 3;

export const URLRedirector = {
  /**
   * Try each redirection pattern in order. Return the unwrapped URL
   * if any pattern matches, otherwise null.
   *
   * @param url - URL to attempt to unwrap.
   * @param redirections - regex patterns; each must contain exactly one capture group.
   * @returns Decoded target URL, or null if no pattern matched.
   */
  unwrap(url: string, redirections: string[]): string | null {
    for (const pattern of redirections) {
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'i');
      } catch {
        continue;
      }
      const match = regex.exec(url);
      if (!match) continue;
      const captured = match[1];
      if (!captured) continue;
      let decoded: string;
      try {
        decoded = decodeURIComponent(captured);
      } catch {
        decoded = captured;
      }
      // Reject obviously invalid targets — must look like an absolute URL.
      if (!/^https?:\/\//i.test(decoded)) continue;
      return decoded;
    }
    return null;
  },
};
