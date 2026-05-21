/**
 * Link Clean Pipeline
 *
 * Composes all pipeline stages into the full URL-cleaning pipeline:
 *
 *   Raw Text Input
 *     → URLExtractor      (find all URLs)
 *     → URLNormalizer     (percent-decode, lowercase scheme+host)
 *     → URLRedirector     (unwrap embedded target URLs, max 3 hops)
 *     → GlobalRuleApplicator (remove UTM, gclid, fbclid, etc.)
 *     → DomainMatcher     (find domain-specific rule sets)
 *     → DomainRuleApplicator (apply domain-specific cleaning)
 *     → URLReassembler    (substitute back into original text)
 *     → Cleaned Text Output
 *
 * Rule application honors:
 *   - exceptions[] (per-rule and per-domain)
 *   - path_pattern (per-rule)
 *   - enabledCategories (per-pipeline-invocation user preference)
 *
 * The pipeline is async to allow future Worker offloading but currently
 * executes synchronously.
 */

import { URLExtractor } from './URLExtractor';
import { URLNormalizer } from './URLNormalizer';
import { GlobalRuleApplicator } from './GlobalRuleApplicator';
import { DomainMatcher } from './DomainMatcher';
import { DomainRuleApplicator } from './DomainRuleApplicator';
import { URLReassembler } from './URLReassembler';
import { URLRedirector, MAX_REDIRECT_HOPS } from './URLRedirector';
import type { Ruleset, RuleCategory } from '../rules/RulesetSchema';

export interface PipelineResult {
  originalText: string;
  cleanedText: string;
  urlsFound: number;
  urlsCleaned: number;
  changesMade: boolean;
}

export interface PipelineOptions {
  /** If set, only rules with categories in this set are applied.
   *  Rules without a category are always applied. */
  enabledCategories?: Set<RuleCategory>;
}

export interface Pipeline {
  process(rawText: string, ruleset: Ruleset, options?: PipelineOptions): Promise<PipelineResult>;
}

const domainMatcher = new DomainMatcher();
let compiledRulesetVersion: string | null = null;

function getPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

/**
 * Unwrap redirect-wrapper URLs by recursively applying any matching
 * redirection patterns from the ruleset. Returns the unwrapped URL.
 * Capped at MAX_REDIRECT_HOPS to prevent infinite loops on hostile input.
 */
function unwrapRedirects(url: string, _ruleset: Ruleset): string {
  let current = url;
  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    const hostname = DomainMatcher.hostnameFrom(current);
    if (!hostname) return current;
    const redirections = domainMatcher.matchRedirections(current);
    if (redirections.length === 0) return current;
    const unwrapped = URLRedirector.unwrap(current, redirections);
    if (!unwrapped || unwrapped === current) return current;
    current = URLNormalizer.decode(unwrapped);
  }
  return current;
}

/**
 * Build the Link Clean pipeline and return the `process` function.
 * Stateless except for the pre-compiled DomainMatcher.
 */
export const LinkCleanPipeline: Pipeline = {
  process(
    rawText: string,
    ruleset: Ruleset,
    options: PipelineOptions = {},
  ): Promise<PipelineResult> {
    if (compiledRulesetVersion !== ruleset.version) {
      domainMatcher.precompile(ruleset);
      compiledRulesetVersion = ruleset.version;
    }

    const extractions = URLExtractor.extract(rawText);
    if (extractions.length === 0) {
      return Promise.resolve({
        originalText: rawText,
        cleanedText: rawText,
        urlsFound: 0,
        urlsCleaned: 0,
        changesMade: false,
      });
    }

    const cleanedUrls: string[] = extractions.map(({ url }) => {
      // Stage 2: normalise
      let cleaned = URLNormalizer.decode(url);

      // Stage 3: unwrap redirects (Tier 1.2)
      cleaned = unwrapRedirects(cleaned, ruleset);

      const pathname = getPathname(cleaned);
      const applyOpts: { enabledCategories?: Set<RuleCategory>; pathname: string } = {
        pathname,
      };
      if (options.enabledCategories) {
        applyOpts.enabledCategories = options.enabledCategories;
      }

      // Stage 4: global rules
      cleaned = GlobalRuleApplicator.apply(cleaned, ruleset.global_rules, applyOpts);

      // Stage 5+6: domain-specific rules + exceptions
      const hostname = DomainMatcher.hostnameFrom(cleaned) ?? DomainMatcher.hostnameFrom(url);
      if (hostname) {
        const matches = domainMatcher.match(cleaned);
        for (const matched of matches) {
          if (matched.rules.length === 0) continue;
          cleaned = DomainRuleApplicator.apply(
            cleaned,
            matched.rules,
            matched.exceptions,
            applyOpts,
          );
        }
      }

      return cleaned;
    });

    const cleanedText = URLReassembler.reassemble({
      originalText: rawText,
      extractions,
      cleanedUrls,
    });

    const urlsCleaned = cleanedUrls.filter((c, i) => c !== extractions[i].url).length;

    return Promise.resolve({
      originalText: rawText,
      cleanedText,
      urlsFound: extractions.length,
      urlsCleaned,
      changesMade: cleanedText !== rawText,
    });
  },
};

export {
  URLExtractor,
  URLNormalizer,
  GlobalRuleApplicator,
  DomainMatcher,
  DomainRuleApplicator,
  URLReassembler,
  URLRedirector,
};
