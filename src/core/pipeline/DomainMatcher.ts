/**
 * DomainMatcher
 *
 * Matches a URL's hostname against domain patterns defined in the ruleset.
 * Patterns are pre-compiled at ruleset-load time to avoid re-compiling regex
 * on every pipeline invocation.
 *
 * Supports three pattern formats:
 *  - Exact TLD variants:  ^(?:.*\.)?ebay\.(com|co\.uk|de)$
 *  - Subdomain wildcard:  ^(?:.*\.)?amazon\.com$
 *  - Exact domain:        ^t\.co$
 */

import type { Rule, Ruleset } from '../rules/RulesetSchema';

/** A matched domain entry with all metadata preserved. */
export interface MatchedDomain {
  rules: Rule[];
  redirections: string[];
  exceptions: string[];
}

interface CompiledDomain extends MatchedDomain {
  pattern: RegExp;
}

export class DomainMatcher {
  private compiled: CompiledDomain[] = [];

  precompile(ruleset: Ruleset): void {
    this.compiled = [];

    for (const domainRule of ruleset.domain_rules) {
      try {
        this.compiled.push({
          pattern: new RegExp(domainRule.domain_pattern, 'i'),
          rules: domainRule.rules ?? [],
          redirections: domainRule.redirections ?? [],
          exceptions: domainRule.exceptions ?? [],
        });
      } catch (err) {
        console.warn(
          `[DomainMatcher] Invalid domain_pattern "${domainRule.domain_pattern}": ${String(err)}`,
        );
      }
    }
  }

  /** All matched domain entries (each with rules, redirections, exceptions). */
  match(url: string): MatchedDomain[] {
    return this.compiled
      .filter((c) => c.pattern.test(url))
      .map((c) => ({
        rules: c.rules,
        redirections: c.redirections,
        exceptions: c.exceptions,
      }));
  }

  /** Flattened rules across all matching domain entries. */
  matchFlat(url: string): Rule[] {
    return this.match(url).flatMap((m) => m.rules);
  }

  /** Aggregated redirections across all matching domain entries. */
  matchRedirections(url: string): string[] {
    return this.match(url).flatMap((m) => m.redirections);
  }

  /** Aggregated exceptions across all matching domain entries. */
  matchExceptions(url: string): string[] {
    return this.match(url).flatMap((m) => m.exceptions);
  }

  static hostnameFrom(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}
