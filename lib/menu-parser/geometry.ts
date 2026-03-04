/**
 * Geometry utilities for menu parsing.
 * Filters OCR words that fall within a section's bounding box.
 */

import { WordData, SectionBBox } from './types';

const TOLERANCE_PX = 2;

/**
 * Check if a word's bounding box overlaps with a section bbox.
 * Uses a 2px tolerance so words slightly outside the drawn box are included.
 */
export function wordOverlapsSection(word: WordData, section: SectionBBox): boolean {
  // Expand section bbox by tolerance
  const sx0 = section.x0 - TOLERANCE_PX;
  const sy0 = section.y0 - TOLERANCE_PX;
  const sx1 = section.x1 + TOLERANCE_PX;
  const sy1 = section.y1 + TOLERANCE_PX;

  // Check for non-overlap (any of these means no intersection)
  if (word.bbox_x1 < sx0) return false; // word is left of section
  if (word.bbox_x0 > sx1) return false; // word is right of section
  if (word.bbox_y1 < sy0) return false; // word is above section
  if (word.bbox_y0 > sy1) return false; // word is below section

  return true;
}

/**
 * Filter words that fall within a section's bounding box.
 */
export function filterWordsInSection(words: WordData[], section: SectionBBox): WordData[] {
  return words.filter(w => wordOverlapsSection(w, section));
}
