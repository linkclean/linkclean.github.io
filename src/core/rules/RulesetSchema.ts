/**
 * RulesetSchema
 *
 * Zod schema definition for Link Clean's rules.json format.
 *
 * Schema version 2.1 adds:
 *   - param_name shorthand (Tier 1.3): expand at load time to regex
 *   - exceptions[] on Rule + DomainRule (Tier 1.1): skip rule when URL matches
 *   - redirections[] on DomainRule (Tier 1.2): unwrap embedded target URLs
 *   - category on Rule (Tier 2.1): per-category enable/disable
 *   - path_pattern on Rule (Tier 2.2): finer scoping than domain
 *   - schema_version (Tier 3.1): explicit forward-compat marker
 *   - min_app_version (Tier 3.2): ruleset can require newer app
 *   - signature (Tier 3.3): optional ed25519 detached signature
 */

import { z } from 'zod';

export const CURRENT_SCHEMA_VERSION = '2.1';

/** Validates that a string is a valid JavaScript RegExp pattern. */
const validRegex = (fieldName: string): z.ZodEffects<z.ZodString> =>
  z.string().refine(
    (r) => {
      try {
        new RegExp(r);
        return true;
      } catch {
        return false;
      }
    },
    { message: `${fieldName} must be a valid regex pattern` },
  );

/** Rule categories — used for user-level enable/disable. */
export const RULE_CATEGORIES = [
  'utm',
  'click_id',
  'session',
  'fingerprint',
  'referral',
  'redirect_param',
  'other',
] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

/**
 * A single removal rule.
 *
 * Authors specify EITHER `param_name` (expanded automatically to `[?&]<name>=[^&]*`)
 * OR `regex` (used verbatim). Exactly one is required.
 */
export const RuleSchema = z
  .object({
    /** Human-readable name (used in logs/UI). */
    name: z.string().optional(),
    /** Regex pattern applied with /gi flag. Mutually exclusive with `param_name`. */
    regex: validRegex('regex').optional(),
    /** Plain query-param name. Expanded to `[?&]<escaped>=[^&]*`. */
    param_name: z
      .string()
      .regex(/^[A-Za-z0-9_.+-]+$/)
      .optional(),
    /** Documentation for contributors. */
    comment: z.string().optional(),
    /** Tag for per-category enable/disable. */
    category: z.enum(RULE_CATEGORIES).optional(),
    /** Regex patterns; if any matches the URL, this rule is skipped. */
    exceptions: z.array(validRegex('exceptions')).optional(),
    /** Regex matched against URL pathname; rule applies only if it matches. */
    path_pattern: validRegex('path_pattern').optional(),
  })
  .refine((d) => Boolean(d.regex) !== Boolean(d.param_name), {
    message: 'Rule must have exactly one of `regex` or `param_name`',
  });

export type Rule = z.infer<typeof RuleSchema>;

/**
 * Resolve a Rule to its concrete regex string.
 * Handles the `param_name` shorthand at use sites.
 */
export function resolveRuleRegex(rule: Rule): string {
  if (rule.regex) return rule.regex;
  if (rule.param_name) {
    const escaped = rule.param_name.replace(/[.+*?^$()[\]{}|\\]/g, '\\$&');
    return `[?&]${escaped}=[^&]*`;
  }
  // Should be unreachable due to schema refine
  throw new Error('Rule has neither regex nor param_name');
}

/**
 * Rules applying to URLs whose hostname matches `domain_pattern`.
 * May carry param-removal rules, redirect-unwrap regexes, or domain-wide exceptions.
 */
export const DomainRuleSchema = z
  .object({
    /** Regex matched against the URL hostname. */
    domain_pattern: validRegex('domain_pattern'),
    /** Param-removal rules. */
    rules: z.array(RuleSchema).optional(),
    /**
     * Redirect-unwrap patterns. Each regex must contain ONE capture group
     * holding the (URL-encoded) target. Matching URLs are replaced with
     * the decoded capture and re-fed into the pipeline (max 3 hops).
     */
    redirections: z.array(validRegex('redirections')).optional(),
    /** Regex list; matching URLs skip ALL rules for this domain. */
    exceptions: z.array(validRegex('domain_exceptions')).optional(),
  })
  .refine((d) => (d.rules && d.rules.length > 0) || (d.redirections && d.redirections.length > 0), {
    message: 'DomainRule must have at least one rule or redirection',
  });

export type DomainRule = z.infer<typeof DomainRuleSchema>;

/** Optional ed25519 detached signature over canonicalised ruleset JSON. */
export const SignatureSchema = z.object({
  algorithm: z.literal('ed25519'),
  /** Base64 signature bytes. */
  value: z.string().min(1),
  signed_at: z.string().datetime({ offset: true }),
  /** Optional key fingerprint to disambiguate during key rotation. */
  key_id: z.string().optional(),
});

export type Signature = z.infer<typeof SignatureSchema>;

/** Top-level schema for a complete rules.json file. */
export const RulesetSchema = z.object({
  /**
   * Schema format version (separate from `version` which is the content version).
   * Older clients that don't know this version SHOULD reject the file
   * and continue using their cached/seed copy.
   */
  schema_version: z
    .string()
    .regex(/^\d+\.\d+$/, 'schema_version must be x.y')
    .optional(),
  /** Semver content version. Must be incremented on every update. */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be semver (x.y.z)'),
  /** ISO 8601 datetime of the last update. */
  updated_at: z.string().datetime({ offset: true }).optional(),
  /** Minimum Link Clean version required to safely apply this ruleset. */
  min_app_version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'min_app_version must be semver (x.y.z)')
    .optional(),
  /** Optional detached signature for supply-chain integrity. */
  signature: SignatureSchema.optional(),
  /** Rules applied to every URL, regardless of domain. */
  global_rules: z.array(RuleSchema),
  /** Domain-specific rule groups. May be empty. */
  domain_rules: z.array(DomainRuleSchema),
});

export type Ruleset = z.infer<typeof RulesetSchema>;
