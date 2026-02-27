/**
 * Beverage Dictionary - Re-exported from @thirst-metrics/ocr-engine
 * This file maintains backward compatibility with existing imports.
 */

import {
  OCRPipeline,
  BEVERAGE_TERMS,
  getBuiltInDictionary,
  DictionaryManager,
} from '@thirst-metrics/ocr-engine';

// Re-export the raw dictionary for direct access
export { BEVERAGE_TERMS, getBuiltInDictionary };

// Backward-compatible function: correct OCR text using the dictionary
// Uses a singleton pipeline for the correction
let _pipeline: OCRPipeline | null = null;
function getPipeline(): OCRPipeline {
  if (!_pipeline) _pipeline = new OCRPipeline();
  return _pipeline;
}

const _manager = new DictionaryManager();

export function correctBeverageTerms(rawText: string): string {
  // Replicate the old behavior: apply dictionary corrections to full text
  if (!rawText) return rawText;

  let corrected = rawText;
  const dict = getBuiltInDictionary();

  for (const [mistake, correction] of Object.entries(dict)) {
    const escaped = mistake.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
    corrected = corrected.replace(pattern, (match) => {
      if (match === match.toUpperCase()) return correction.toUpperCase();
      if (match[0] === match[0].toUpperCase()) {
        return correction.charAt(0).toUpperCase() + correction.slice(1);
      }
      return correction;
    });
  }

  return corrected;
}

export function extractBeverageTerms(text: string): string[] {
  if (!text) return [];

  const corrected = correctBeverageTerms(text.toLowerCase());
  const found: Set<string> = new Set();
  const allTerms = new Set(Object.values(getBuiltInDictionary()));

  for (const term of allTerms) {
    if (corrected.includes(term)) {
      found.add(term);
    }
  }

  return Array.from(found).sort();
}

export function getBeverageDictionary(): Record<string, string> {
  return getBuiltInDictionary();
}

export function addBeverageTerm(mistake: string, correction: string): void {
  _manager.addLearnedEntry(mistake, correction);
}
