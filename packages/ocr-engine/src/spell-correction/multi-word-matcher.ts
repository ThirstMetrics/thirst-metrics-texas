/**
 * Multi-word dictionary matcher for OCR spell correction.
 *
 * Handles multi-word dictionary entries where the mistake pattern spans
 * two or more words (e.g., "jack danie1s" -> "jack daniels",
 * "bud 1ight" -> "bud light", "blanc de b1ancs" -> "blanc de blancs").
 *
 * Uses a prefix trie structure for efficient lookups: the first word of
 * each mistake pattern serves as the prefix key, and the remaining words
 * (joined with a space) map to the corresponding DictionaryEntry.
 */

import type { DictionaryEntry } from '../types';

export interface MultiWordMatch {
  /** The dictionary entry that matched */
  entry: DictionaryEntry;
  /** Index of the first word in the input array that matched */
  startIndex: number;
  /** Index past the last matched word (exclusive) */
  endIndex: number;
  /** The original text that was matched, joined with spaces */
  matchedText: string;
}

export class MultiWordMatcher {
  /**
   * Prefix trie for efficient multi-word lookups.
   *
   * Structure: first-word (lowercase) -> Map<remaining-words-joined (lowercase), DictionaryEntry>
   *
   * Examples:
   *   "jack danie1s"       -> prefixMap["jack"]  -> Map{ "danie1s"    -> entry }
   *   "blanc de b1ancs"    -> prefixMap["blanc"] -> Map{ "de b1ancs"  -> entry }
   *   "bud 1ight"          -> prefixMap["bud"]   -> Map{ "1ight"      -> entry }
   */
  private prefixMap: Map<string, Map<string, DictionaryEntry>>;

  /** The maximum number of words in any dictionary entry (used to bound look-ahead) */
  private maxWordCount: number;

  constructor(entries: DictionaryEntry[]) {
    this.prefixMap = new Map();
    this.maxWordCount = 0;

    for (const entry of entries) {
      // Only process multi-word entries
      if (entry.wordCount <= 1) {
        continue;
      }

      const words = entry.mistake.toLowerCase().split(/\s+/);
      if (words.length < 2) {
        // Safety check: wordCount says multi-word but splitting yields < 2
        continue;
      }

      const firstWord = words[0];
      const remainingKey = words.slice(1).join(' ');

      let continuations = this.prefixMap.get(firstWord);
      if (!continuations) {
        continuations = new Map();
        this.prefixMap.set(firstWord, continuations);
      }

      continuations.set(remainingKey, entry);

      if (words.length > this.maxWordCount) {
        this.maxWordCount = words.length;
      }
    }
  }

  /**
   * Find all multi-word matches in a sequence of words.
   *
   * Scans left-to-right through the word array. At each position, checks
   * whether the current word is a known prefix and, if so, attempts to
   * match progressively longer continuations (greedy / longest-match-first).
   *
   * Returns non-overlapping matches sorted by position. When two potential
   * matches overlap, the one starting at the earlier position wins (and
   * among those, the longer match wins).
   *
   * @param words - Array of word objects with at least `rawText` and `index`
   *                properties. `index` is the word's position in the original
   *                OCR word array.
   * @returns Non-overlapping MultiWordMatch array sorted by startIndex.
   */
  findMatches(words: Array<{ rawText: string; index: number }>): MultiWordMatch[] {
    if (words.length === 0 || this.prefixMap.size === 0) {
      return [];
    }

    const matches: MultiWordMatch[] = [];
    // Track which word positions are already consumed by a match
    const consumed = new Set<number>();

    for (let i = 0; i < words.length; i++) {
      // Skip positions already consumed by an earlier match
      if (consumed.has(i)) {
        continue;
      }

      const firstWord = words[i].rawText.toLowerCase();
      const continuations = this.prefixMap.get(firstWord);
      if (!continuations) {
        continue;
      }

      // Try longest possible continuation first (greedy)
      const maxLookAhead = Math.min(this.maxWordCount - 1, words.length - i - 1);
      let bestMatch: MultiWordMatch | null = null;

      for (let len = maxLookAhead; len >= 1; len--) {
        // Build the continuation key from the next `len` words
        const continuationWords: string[] = [];
        for (let j = 1; j <= len; j++) {
          continuationWords.push(words[i + j].rawText.toLowerCase());
        }
        const continuationKey = continuationWords.join(' ');

        const entry = continuations.get(continuationKey);
        if (entry) {
          // Collect the matched raw text preserving original casing
          const matchedParts: string[] = [];
          for (let j = 0; j <= len; j++) {
            matchedParts.push(words[i + j].rawText);
          }

          bestMatch = {
            entry,
            startIndex: i,
            endIndex: i + len + 1, // exclusive
            matchedText: matchedParts.join(' '),
          };
          // Longest match found -- stop searching shorter continuations
          break;
        }
      }

      if (bestMatch) {
        // Mark all positions in this match as consumed
        for (let j = bestMatch.startIndex; j < bestMatch.endIndex; j++) {
          consumed.add(j);
        }
        matches.push(bestMatch);
      }
    }

    // Matches are already in position order due to left-to-right scan
    return matches;
  }

  /**
   * Find the longest multi-word match starting at a specific position.
   * Used by the SpellCorrector which manages its own iteration.
   *
   * @param words - Full word array with rawText property
   * @param startPos - Position to start matching from
   * @returns Match info or null if no match at this position
   */
  findLongestMatch(
    words: Array<{ rawText: string; index: number }>,
    startPos: number,
  ): { entry: DictionaryEntry; spanLength: number; matchedText: string } | null {
    if (startPos >= words.length || this.prefixMap.size === 0) {
      return null;
    }

    const firstWord = words[startPos].rawText.toLowerCase();
    const continuations = this.prefixMap.get(firstWord);
    if (!continuations) return null;

    const maxLookAhead = Math.min(this.maxWordCount - 1, words.length - startPos - 1);

    for (let len = maxLookAhead; len >= 1; len--) {
      const continuationWords: string[] = [];
      for (let j = 1; j <= len; j++) {
        continuationWords.push(words[startPos + j].rawText.toLowerCase());
      }
      const continuationKey = continuationWords.join(' ');

      const entry = continuations.get(continuationKey);
      if (entry) {
        const matchedParts: string[] = [];
        for (let j = 0; j <= len; j++) {
          matchedParts.push(words[startPos + j].rawText);
        }
        return {
          entry,
          spanLength: len + 1,
          matchedText: matchedParts.join(' '),
        };
      }
    }

    return null;
  }
}
