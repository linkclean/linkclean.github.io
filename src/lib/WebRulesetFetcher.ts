import { RulesetSchema, type Ruleset } from '../core/rules/RulesetSchema';

const RULES_URL =
  'https://raw.githubusercontent.com/linkclean/linkclean-rules/main/rules.min.json';

const CACHE_KEY = 'linkclean_rules_v1';
const CACHE_TS_KEY = 'linkclean_rules_ts_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function readCache(): { ruleset: Ruleset; ts: number } | null {
  try {
    const ts = parseInt(localStorage.getItem(CACHE_TS_KEY) ?? '', 10);
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw || isNaN(ts)) return null;
    const parsed = RulesetSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return { ruleset: parsed.data, ts };
  } catch {
    return null;
  }
}

function writeCache(ruleset: Ruleset): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(ruleset));
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  } catch {
    // localStorage full or unavailable — non-fatal
  }
}

async function fetchFromNetwork(): Promise<Ruleset | null> {
  try {
    const cached = readCache();
    const headers: HeadersInit = { Accept: 'application/json' };

    // Use Last-Modified for conditional requests (CORS-safe header)
    if (cached) {
      const lastModified = localStorage.getItem('linkclean_rules_lm_v1');
      if (lastModified) headers['If-Modified-Since'] = lastModified;
    }

    const res = await fetch(RULES_URL, { headers });

    if (res.status === 304) return cached?.ruleset ?? null;
    if (!res.ok) return null;

    const lm = res.headers.get('Last-Modified');
    if (lm) {
      try { localStorage.setItem('linkclean_rules_lm_v1', lm); } catch { /* non-fatal */ }
    }

    const json: unknown = await res.json();
    const parsed = RulesetSchema.safeParse(json);
    if (!parsed.success) return null;

    writeCache(parsed.data);
    return parsed.data;
  } catch {
    return null;
  }
}

export interface FetchResult {
  ruleset: Ruleset | null;
  /** True if the ruleset came from a fresh network fetch (rules may have updated). */
  fromNetwork: boolean;
}

/**
 * Load the ruleset for use in the browser.
 *
 * Strategy:
 *   1. Return cached rules immediately if < 24 h old.
 *   2. Fetch from GitHub Raw in the background; update cache on success.
 *   3. If no cache and network fails, return null.
 */
export async function fetchRuleset(): Promise<FetchResult> {
  const cached = readCache();
  const fresh = cached && Date.now() - cached.ts < CACHE_TTL_MS;

  if (fresh) {
    // Refresh cache silently in background without blocking the caller
    void fetchFromNetwork();
    return { ruleset: cached.ruleset, fromNetwork: false };
  }

  // No fresh cache — must wait for network
  const ruleset = await fetchFromNetwork();
  if (ruleset) return { ruleset, fromNetwork: true };

  // Network failed — use stale cache if available
  if (cached) return { ruleset: cached.ruleset, fromNetwork: false };

  return { ruleset: null, fromNetwork: false };
}
