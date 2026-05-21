import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchRuleset } from '../lib/WebRulesetFetcher';
import { LinkCleanPipeline } from '../core/pipeline/index';
import { isShortLink } from '../core/utils/ShortLinkResolver';
import shortlinkData from '../core/shortlinks/shortlinks.json';
import type { Ruleset } from '../core/rules/RulesetSchema';

const SHORT_DOMAINS: string[] = shortlinkData.domains;

interface CleanerIslandProps {
  /** Compact mode for the homepage demo strip. Full UI when false. */
  compact?: boolean;
}

interface CleanResult {
  cleanedText: string;
  urlsFound: number;
  urlsCleaned: number;
  changesMade: boolean;
}

export default function CleanerIsland({ compact = false }: CleanerIslandProps) {
  const [ruleset, setRuleset] = useState<Ruleset | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<CleanResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [shortLinkDetected, setShortLinkDetected] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchRuleset()
      .then(({ ruleset: r }) => setRuleset(r))
      .finally(() => setLoading(false));
  }, []);

  const clean = useCallback(
    async (text: string) => {
      if (!ruleset || !text.trim()) {
        setResult(null);
        setShortLinkDetected(false);
        return;
      }
      // Detect short links — browser can't resolve them (CORS), surface guidance instead
      const urlMatches = text.match(/https?:\/\/[^\s"'>]+/gi) ?? [];
      setShortLinkDetected(urlMatches.some((u) => isShortLink(u, SHORT_DOMAINS)));

      const r = await LinkCleanPipeline.process(text, ruleset);
      setResult(r);
    },
    [ruleset],
  );

  const handleInput = (value: string) => {
    setInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void clean(value), 120);
  };

  const handleCopy = () => {
    if (!result?.cleanedText) return;
    void navigator.clipboard.writeText(result.cleanedText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const handleClear = () => {
    setInput('');
    setResult(null);
  };

  const placeholder = compact
    ? 'Paste a URL to clean it…'
    : 'Paste a URL or any text containing URLs — tracking parameters will be stripped instantly.';

  if (compact) {
    return (
      <div className="cleaner-compact">
        <div className="cleaner-input-wrap">
          <textarea
            className="cleaner-textarea cleaner-textarea--compact"
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            placeholder={placeholder}
            rows={2}
            spellCheck={false}
          />
        </div>

        {loading && !result && (
          <div className="cleaner-status">Loading rules…</div>
        )}

        {result && (
          <div className="cleaner-output-wrap">
            <div className="cleaner-output cleaner-output--compact">
              {result.cleanedText}
            </div>
            {shortLinkDetected && (
              <div className="cleaner-shortlink-notice">
                Short link detected — browsers can't follow redirects due to CORS.
                Use the <strong>Link Clean app</strong> to resolve and clean it.
              </div>
            )}
            <div className="cleaner-footer">
              <span className="cleaner-stat">
                {result.urlsCleaned > 0
                  ? `${result.urlsCleaned} of ${result.urlsFound} URL${result.urlsFound !== 1 ? 's' : ''} cleaned`
                  : result.urlsFound > 0
                    ? 'No tracking params found'
                    : 'No URLs found'}
              </span>
              <div className="cleaner-actions">
                {result.changesMade && (
                  <button className="cleaner-btn" onClick={handleCopy}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                )}
                <a href="/clean" className="cleaner-btn cleaner-btn--ghost">
                  Full cleaner →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="cleaner-full">
      <div className="cleaner-panel">
        <div className="cleaner-panel-label">Input</div>
        <textarea
          className="cleaner-textarea cleaner-textarea--full"
          value={input}
          onChange={(e) => handleInput(e.target.value)}
          placeholder={placeholder}
          rows={8}
          spellCheck={false}
          autoFocus
        />
        <div className="cleaner-panel-footer">
          {input && (
            <button className="cleaner-btn cleaner-btn--ghost" onClick={handleClear}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="cleaner-divider">
        {loading ? (
          <span className="cleaner-arrow cleaner-arrow--loading">⋯</span>
        ) : (
          <span className="cleaner-arrow">→</span>
        )}
      </div>

      <div className="cleaner-panel">
        <div className="cleaner-panel-label">
          Cleaned
          {result && result.urlsCleaned > 0 && (
            <span className="cleaner-badge">
              {result.urlsCleaned} cleaned
            </span>
          )}
          {result && result.urlsCleaned === 0 && result.urlsFound > 0 && (
            <span className="cleaner-badge cleaner-badge--neutral">
              nothing to remove
            </span>
          )}
        </div>
        <div
          className={`cleaner-output cleaner-output--full${!result ? ' cleaner-output--empty' : ''}`}
        >
          {result
            ? result.cleanedText
            : input
              ? loading
                ? 'Loading rules…'
                : ''
              : 'Cleaned output will appear here.'}
        </div>
        {shortLinkDetected && (
          <div className="cleaner-shortlink-notice">
            Short link detected — browsers can't follow redirects due to CORS.
            Use the <strong>Link Clean app</strong> to resolve and clean it on-device.
          </div>
        )}
        <div className="cleaner-panel-footer">
          {result?.changesMade && (
            <button className="cleaner-btn" onClick={handleCopy}>
              {copied ? '✓ Copied!' : 'Copy to clipboard'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
