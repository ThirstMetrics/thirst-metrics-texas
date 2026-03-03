import type { OCRWord, CorrectionRecord, DictionaryEntry, BBox } from '../types';
import { MultiWordMatcher } from './multi-word-matcher';

/**
 * Word-level spell correction using the beverage dictionary.
 *
 * Correction order:
 *   1. Multi-word matches are attempted first (longer spans take priority).
 *   2. Remaining uncorrected words are checked against the single-word map.
 *
 * Words that were already corrected by a multi-word match are never
 * re-evaluated, preventing double-correction.
 */
export class SpellCorrector {
  private singleWordMap: Map<string, DictionaryEntry>;
  private multiWordMatcher: MultiWordMatcher;

  constructor(entries: DictionaryEntry[]) {
    this.singleWordMap = new Map<string, DictionaryEntry>();
    const multiWordEntries: DictionaryEntry[] = [];

    for (const entry of entries) {
      if (entry.wordCount > 1) {
        multiWordEntries.push(entry);
      } else {
        // For single-word entries, key by the lowercase mistake.
        // If two entries share the same mistake key, the last one wins.
        this.singleWordMap.set(entry.mistake.toLowerCase(), entry);
      }
    }

    this.multiWordMatcher = new MultiWordMatcher(multiWordEntries);
  }

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  /**
   * Correct a sequence of OCR words in-place, tracking all corrections.
   *
   * @param words - The mutable array of OCR words to correct.
   * @returns Every correction that was applied, in document order.
   */
  correctWords(words: OCRWord[]): CorrectionRecord[] {
    const corrections: CorrectionRecord[] = [];

    // Set of word indices that have already been corrected (by multi-word
    // matching) so we can skip them during the single-word pass.
    const correctedIndices = new Set<number>();

    // ----- Pass 1: Multi-word matches -----
    const multiWordCorrections = this.correctMultiWords(words, correctedIndices);
    corrections.push(...multiWordCorrections);

    // ----- Pass 2: Single-word matches for anything not yet corrected -----
    for (const word of words) {
      if (correctedIndices.has(word.index)) {
        continue;
      }

      const record = this.correctSingleWord(word);
      if (record) {
        correctedIndices.add(word.index);
        corrections.push(record);
      }
    }

    // Return corrections sorted by word index for deterministic output.
    corrections.sort((a, b) => a.wordIndex - b.wordIndex);

    return corrections;
  }

  // -------------------------------------------------------------------
  // Multi-word correction
  // -------------------------------------------------------------------

  /**
   * Scan through the word array looking for multi-word dictionary matches.
   *
   * At each position we ask the {@link MultiWordMatcher} for the longest
   * match starting at that position.  If a match is found the constituent
   * words are corrected, their indices are recorded in `correctedIndices`,
   * and we advance past the entire span.
   */
  private correctMultiWords(
    words: OCRWord[],
    correctedIndices: Set<number>,
  ): CorrectionRecord[] {
    const corrections: CorrectionRecord[] = [];
    let i = 0;

    while (i < words.length) {
      // Skip words that were already handled (e.g. by an earlier overlapping
      // match, though in practice we always advance past the full span).
      if (correctedIndices.has(words[i].index)) {
        i++;
        continue;
      }

      const match = this.multiWordMatcher.findLongestMatch(words, i);

      if (!match) {
        i++;
        continue;
      }

      const { entry, spanLength } = match;
      const correctionWords = entry.correction.split(/\s+/);
      const sourceLabel: 'dictionary' | 'learned' =
        entry.source === 'learned' ? 'learned' : 'dictionary';

      // Apply the correction across the matched span.
      for (let offset = 0; offset < spanLength; offset++) {
        const word = words[i + offset];

        // Determine the replacement text for this particular word in the
        // span.  If the correction has fewer tokens than the mistake we
        // assign empty strings to the trailing words; if it has more we
        // concatenate the extras onto the last word.
        let replacement: string;
        if (offset < correctionWords.length - 1) {
          replacement = correctionWords[offset];
        } else if (offset === correctionWords.length - 1) {
          // Last correction token — if the correction has *fewer* tokens
          // than the mistake span, concatenate remaining tokens here.
          replacement = correctionWords.slice(offset).join(' ');
        } else {
          // More mistake words than correction words — clear the surplus.
          replacement = '';
        }

        const correctedText =
          replacement === '' ? '' : this.preserveCase(word.rawText, replacement);

        word.correctedText = correctedText;
        word.wasCorrected = true;
        word.correctionSource = sourceLabel;
        word.dictionaryKey = entry.mistake;

        correctedIndices.add(word.index);

        corrections.push({
          wordIndex: word.index,
          originalText: word.rawText,
          correctedText,
          correctionSource: sourceLabel,
          dictionaryKey: entry.mistake,
          confidence: word.confidence,
          bbox: word.bbox,
          lineIndex: word.lineIndex,
          blockIndex: word.blockIndex,
        });
      }

      // Advance past the entire matched span.
      i += spanLength;
    }

    return corrections;
  }

  // -------------------------------------------------------------------
  // Single-word correction
  // -------------------------------------------------------------------

  /** Correct a single word against the dictionary. */
  private correctSingleWord(word: OCRWord): CorrectionRecord | null {
    const key = word.rawText.toLowerCase();
    const entry = this.singleWordMap.get(key);

    if (!entry || entry.correction.toLowerCase() === key) {
      return null;
    }

    // Apply correction preserving case
    word.correctedText = this.preserveCase(word.rawText, entry.correction);
    word.wasCorrected = true;
    word.correctionSource = entry.source === 'learned' ? 'learned' : 'dictionary';
    word.dictionaryKey = entry.mistake;

    return {
      wordIndex: word.index,
      originalText: word.rawText,
      correctedText: word.correctedText,
      correctionSource: word.correctionSource,
      dictionaryKey: entry.mistake,
      confidence: word.confidence,
      bbox: word.bbox,
      lineIndex: word.lineIndex,
      blockIndex: word.blockIndex,
    };
  }

  // -------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------

  /** Preserve the original case pattern when applying a correction. */
  private preserveCase(original: string, correction: string): string {
    // ALL-CAPS  →  ALL-CAPS correction
    if (original === original.toUpperCase() && original !== original.toLowerCase()) {
      return correction.toUpperCase();
    }

    // Title Case  →  Title Case correction
    if (
      original.length > 0 &&
      original[0] === original[0].toUpperCase() &&
      original[0] !== original[0].toLowerCase()
    ) {
      return correction.charAt(0).toUpperCase() + correction.slice(1);
    }

    // lowercase  →  lowercase correction
    return correction.toLowerCase();
  }
}
