/**
 * URLReassembler
 *
 * Substitutes cleaned URLs back into the source text at their original positions.
 * Works with `ExtractedURL` objects (which record `start` and `end` indices)
 * so that non-URL text is preserved verbatim.
 *
 * The replacement is offset-corrected to account for the fact that cleaned
 * URLs may be shorter (fewer characters) than the originals.
 */

import type { ExtractedURL } from './URLExtractor';

export interface ReassembleInput {
  originalText: string;
  extractions: ExtractedURL[];
  cleanedUrls: string[];
}

export const URLReassembler = {
  /**
   * Replace each extracted URL position in `originalText` with the
   * corresponding cleaned URL.
   *
   * @param input - The original text, extraction metadata, and cleaned URLs.
   *               `extractions` and `cleanedUrls` must have the same length
   *               and be in the same order.
   * @returns The reconstructed text with cleaned URLs substituted in.
   */
  reassemble({ originalText, extractions, cleanedUrls }: ReassembleInput): string {
    if (extractions.length !== cleanedUrls.length) {
      throw new Error(
        `[URLReassembler] Mismatch: ${extractions.length} extractions vs ${cleanedUrls.length} cleaned URLs`,
      );
    }

    let result = originalText;
    let offset = 0; // Cumulative offset from prior replacements

    for (let i = 0; i < extractions.length; i++) {
      const { start, end, url: original } = extractions[i];
      const cleaned = cleanedUrls[i];

      const adjustedStart = start + offset;
      const adjustedEnd = end + offset;

      // Verify the slice matches what we extracted (sanity check)
      const slice = result.slice(adjustedStart, adjustedEnd);
      if (slice !== original) {
        console.warn(
          `[URLReassembler] Slice mismatch at [${adjustedStart}:${adjustedEnd}]: ` +
            `expected "${original}", got "${slice}". Skipping.`,
        );
        continue;
      }

      result = result.slice(0, adjustedStart) + cleaned + result.slice(adjustedEnd);

      // Update offset by the difference in string lengths
      offset += cleaned.length - original.length;
    }

    return result;
  },
};
