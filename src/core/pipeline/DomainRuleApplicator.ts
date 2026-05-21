/**
 * DomainRuleApplicator
 *
 * Applies an array of domain-specific rules to a URL sequentially.
 * Each rule may declare exceptions, a category, and a path_pattern;
 * inapplicable rules are skipped. Invalid regex is logged and skipped.
 */

import type { Rule } from '../rules/RulesetSchema';
import { resolveRuleRegex } from '../rules/RulesetSchema';
import type { ApplyOptions } from './GlobalRuleApplicator';
import { GlobalRuleApplicator } from './GlobalRuleApplicator';

export const DomainRuleApplicator = {
  /**
   * @param url - URL to clean.
   * @param rules - rules from a matched DomainRule.
   * @param domainExceptions - regex list; if any matches the URL, ALL rules are skipped.
   * @param options - per-call filter options.
   */
  apply(
    url: string,
    rules: Rule[],
    domainExceptions: string[] = [],
    options: ApplyOptions = {},
  ): string {
    // Domain-level exception: short-circuit all rules
    for (const ex of domainExceptions) {
      try {
        if (new RegExp(ex, 'i').test(url)) return url;
      } catch {
        // Invalid domain exception — ignore
      }
    }

    const cleaned = rules.reduce((current, rule) => {
      if (!GlobalRuleApplicator._isRuleApplicable(rule, current, options)) {
        return current;
      }
      try {
        const pattern = new RegExp(resolveRuleRegex(rule), 'gi');
        return current.replace(pattern, '');
      } catch (err) {
        console.warn(
          `[DomainRuleApplicator] Invalid regex for rule "${rule.name ?? rule.regex ?? rule.param_name}": ${String(err)}`,
        );
        return current;
      }
    }, url);

    return GlobalRuleApplicator._normaliseQuery(cleaned);
  },
};
