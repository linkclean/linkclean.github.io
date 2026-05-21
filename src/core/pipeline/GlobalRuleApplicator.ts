/**
 * GlobalRuleApplicator
 *
 * Applies a sequence of global tracking-parameter removal rules to a URL.
 * Rules are filtered via:
 *   - exceptions[]    — skip rule if URL matches any exception regex
 *   - path_pattern    — only apply when URL pathname matches
 *   - enabledCategories — only apply rules with allowed category
 *
 * After all substitutions, the URL is normalised to avoid artefacts like
 * a dangling '?' or leading '&' in the query string.
 */

import type { Rule, RuleCategory } from '../rules/RulesetSchema';
import { resolveRuleRegex } from '../rules/RulesetSchema';

/** Per-call filtering options. */
export interface ApplyOptions {
  /** If set, only rules with a category in this set are applied. Rules without
   * a category are always applied. */
  enabledCategories?: Set<RuleCategory>;
  /** Pre-extracted URL pathname for path_pattern filtering. */
  pathname?: string;
}

function isRuleApplicable(rule: Rule, url: string, opts: ApplyOptions): boolean {
  if (
    opts.enabledCategories &&
    rule.category &&
    !opts.enabledCategories.has(rule.category)
  ) {
    return false;
  }
  if (rule.path_pattern && opts.pathname !== undefined) {
    try {
      if (!new RegExp(rule.path_pattern, 'i').test(opts.pathname)) return false;
    } catch {
      // Invalid path_pattern — skip the filter (apply rule)
    }
  }
  if (rule.exceptions) {
    for (const ex of rule.exceptions) {
      try {
        if (new RegExp(ex, 'i').test(url)) return false;
      } catch {
        // Invalid exception regex — ignore
      }
    }
  }
  return true;
}

/**
 * Normalise a URL after parameter removal to clean up artefacts.
 * e.g. "https://x.com/p?&id=1" → "https://x.com/p?id=1"
 *      "https://x.com/p?"      → "https://x.com/p"
 */
function normaliseQuery(url: string): string {
  const hashIdx = url.indexOf('#');
  const fragment = hashIdx >= 0 ? url.slice(hashIdx) : '';
  const base = hashIdx >= 0 ? url.slice(0, hashIdx) : url;

  const qIdx = base.indexOf('?');

  if (qIdx < 0) {
    const schemeEnd = base.indexOf('//');
    const pathStart = schemeEnd >= 0 ? base.indexOf('/', schemeEnd + 2) : 0;
    const searchFrom = pathStart >= 0 ? pathStart : 0;
    const ampIdx = base.indexOf('&', searchFrom);
    if (ampIdx >= 0) {
      return normaliseQuery(
        base.slice(0, ampIdx) + '?' + base.slice(ampIdx + 1) + fragment,
      );
    }
    return base + fragment;
  }

  const path = base.slice(0, qIdx);
  let query = base.slice(qIdx + 1);

  query = query
    .split('&')
    .filter((p) => p.trim().length > 0)
    .join('&');

  if (query.length === 0) return path + fragment;
  return `${path}?${query}${fragment}`;
}

export const GlobalRuleApplicator = {
  /**
   * Apply a list of global rules to a single URL string.
   *
   * @param url - URL to clean.
   * @param rules - global_rules from the ruleset.
   * @param options - per-call filter options.
   */
  apply(url: string, rules: Rule[], options: ApplyOptions = {}): string {
    let result = url;
    for (const rule of rules) {
      if (!isRuleApplicable(rule, result, options)) continue;
      try {
        const pattern = new RegExp(resolveRuleRegex(rule), 'gi');
        result = result.replace(pattern, '');
      } catch (err) {
        console.warn(
          `[GlobalRuleApplicator] Invalid regex for rule "${rule.name ?? rule.regex ?? rule.param_name}": ${String(err)}`,
        );
      }
    }
    return normaliseQuery(result);
  },

  /** @internal — exposed for tests and DomainRuleApplicator. */
  _normaliseQuery: normaliseQuery,
  /** @internal — exposed for tests. */
  _isRuleApplicable: isRuleApplicable,
};
