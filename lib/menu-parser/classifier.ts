/**
 * Line Classifier
 * Classifies parsed lines as headers (h1/h2/h3) or line items
 * based on line height relative to median and presence of price.
 */

import { ParsedLine, ItemType } from './types';

const PRICE_PATTERN = /\$?\d[\d,]*(\.\d{1,2})?$/;

/**
 * Check if a line appears to contain a price (at the right end).
 * Strips trailing OCR garbage (single chars, pipes) before checking.
 */
function hasPrice(line: ParsedLine): boolean {
  let text = line.text.trim();
  // Strip trailing OCR garbage that would mask the price
  text = text.replace(/\s+[|\\\/!@#%^&*]+\s*$/, '').trim();
  text = text.replace(/\s+[a-zA-Z]\s*$/, '').trim();
  return PRICE_PATTERN.test(text);
}

/**
 * Check if a line is noise (page numbers, lone digits, OCR artifacts).
 */
function isNoiseLine(line: ParsedLine): boolean {
  const text = line.text.trim();
  // Single number (1-3 digits) with no other content — likely page number or artifact
  if (/^\d{1,3}$/.test(text)) return true;
  // Single character
  if (text.length <= 1) return true;
  return false;
}

/**
 * Compute the median height of all lines.
 */
function medianHeight(lines: ParsedLine[]): number {
  if (lines.length === 0) return 0;
  const heights = lines.map(l => l.height).sort((a, b) => a - b);
  const mid = Math.floor(heights.length / 2);
  return heights.length % 2 === 0
    ? (heights[mid - 1] + heights[mid]) / 2
    : heights[mid];
}

/**
 * Classify each line as a header level or line_item.
 *
 * Rules:
 * - Height >= 1.3x median + no price → header_1
 * - Height >= 1.2x median + no price → header_2
 * - Short text (≤3 words), no price, few words → header_3
 * - Has price at right end → line_item
 * - Default → line_item
 */
export function classifyLines(lines: ParsedLine[]): (ItemType | 'noise')[] {
  const median = medianHeight(lines);
  const classifications: (ItemType | 'noise')[] = [];

  for (const line of lines) {
    // Filter out noise first (page numbers, lone digits, artifacts)
    if (isNoiseLine(line)) {
      classifications.push('noise');
      continue;
    }

    const lineHasPrice = hasPrice(line);
    const ratio = median > 0 ? line.height / median : 1;
    const wordCount = line.words.length;
    const text = line.text.trim();

    if (!lineHasPrice && ratio >= 1.3 && wordCount <= 6) {
      classifications.push('header_1');
    } else if (!lineHasPrice && ratio >= 1.2 && wordCount <= 6) {
      classifications.push('header_2');
    } else if (!lineHasPrice && wordCount <= 3 && text.length <= 30) {
      classifications.push('header_3');
    } else {
      classifications.push('line_item');
    }
  }

  return classifications;
}
