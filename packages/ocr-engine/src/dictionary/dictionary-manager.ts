/**
 * Dictionary Manager
 * Manages the runtime dictionary by merging built-in entries with learned entries.
 * Learned entries take precedence on conflict.
 */

import type { DictionaryEntry, DictionaryStats, LearnedDictionaryEntry } from '../types';
import { BEVERAGE_TERMS, getBuiltInEntryCount } from './beverage-dictionary';

export class DictionaryManager {
  private entries: Map<string, DictionaryEntry> = new Map();
  private builtInCount = 0;
  private learnedCount = 0;

  constructor() {
    this.loadBuiltIn();
  }

  /** Load the built-in beverage dictionary */
  private loadBuiltIn(): void {
    for (const [mistake, correction] of Object.entries(BEVERAGE_TERMS)) {
      const wordCount = mistake.trim().split(/\s+/).length;
      this.entries.set(mistake.toLowerCase(), {
        mistake: mistake.toLowerCase(),
        correction: correction.toLowerCase(),
        source: 'built-in',
        wordCount,
      });
    }
    this.builtInCount = this.entries.size;
  }

  /** Merge learned dictionary entries. Learned entries override built-in on conflict. */
  mergeLearnedEntries(learned: LearnedDictionaryEntry[]): void {
    // Remove previously merged learned entries
    for (const [key, entry] of this.entries) {
      if (entry.source === 'learned') {
        this.entries.delete(key);
      }
    }
    this.learnedCount = 0;

    for (const entry of learned) {
      if (!entry.isActive) continue;

      const key = entry.mistakeText.toLowerCase().trim();
      if (!key || !entry.correctionText.trim()) continue;

      const wordCount = key.split(/\s+/).length;
      this.entries.set(key, {
        mistake: key,
        correction: entry.correctionText.toLowerCase().trim(),
        source: 'learned',
        wordCount,
      });
      this.learnedCount++;
    }
  }

  /** Add a single learned entry at runtime */
  addLearnedEntry(mistake: string, correction: string): void {
    const key = mistake.toLowerCase().trim();
    if (!key || !correction.trim()) return;

    const wordCount = key.split(/\s+/).length;
    this.entries.set(key, {
      mistake: key,
      correction: correction.toLowerCase().trim(),
      source: 'learned',
      wordCount,
    });
    this.learnedCount++;
  }

  /** Remove a learned entry */
  removeLearnedEntry(mistake: string): boolean {
    const key = mistake.toLowerCase().trim();
    const entry = this.entries.get(key);
    if (!entry || entry.source !== 'learned') return false;

    this.entries.delete(key);
    this.learnedCount--;
    return true;
  }

  /** Get all entries as an array (for the SpellCorrector) */
  getAllEntries(): DictionaryEntry[] {
    return Array.from(this.entries.values());
  }

  /** Get single-word entries only */
  getSingleWordEntries(): DictionaryEntry[] {
    return this.getAllEntries().filter(e => e.wordCount === 1);
  }

  /** Get multi-word entries only */
  getMultiWordEntries(): DictionaryEntry[] {
    return this.getAllEntries().filter(e => e.wordCount > 1);
  }

  /** Get stats about the dictionary */
  getStats(): DictionaryStats {
    return {
      builtInCount: this.builtInCount,
      learnedCount: this.learnedCount,
      totalCount: this.entries.size,
    };
  }

  /** Look up a specific entry */
  lookup(mistake: string): DictionaryEntry | undefined {
    return this.entries.get(mistake.toLowerCase().trim());
  }

  /** Check if a term exists in the dictionary (as a correction value) */
  isKnownTerm(term: string): boolean {
    const lower = term.toLowerCase();
    for (const entry of this.entries.values()) {
      if (entry.correction === lower) return true;
    }
    return false;
  }

  /** Get all unique correction values (for term extraction) */
  getAllCorrectionValues(): Set<string> {
    const values = new Set<string>();
    for (const entry of this.entries.values()) {
      values.add(entry.correction);
    }
    return values;
  }
}
