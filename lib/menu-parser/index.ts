/**
 * Menu Parser Entry Point
 * Parses OCR words within a menu section into structured line items.
 *
 * Pipeline:
 * 1. Filter words to section bbox
 * 2. Group into lines
 * 3. Dispatch to section-type strategy (classify, extract, etc.)
 * 4. Build header hierarchy
 */

import { WordData, SectionInfo, SectionParseResult, ParseStrategy, getSectionCategory } from './types';
import { filterWordsInSection } from './geometry';
import { groupWordsIntoLines } from './line-grouper';
import { buildHierarchy } from './header-hierarchy';
import { wineStrategy } from './strategies/wine-strategy';
import { beerStrategy } from './strategies/beer-strategy';
import { spiritsStrategy } from './strategies/spirits-strategy';
import { cocktailStrategy } from './strategies/cocktail-strategy';
import { sakeStrategy } from './strategies/sake-strategy';

/**
 * Get the parsing strategy for a section type.
 */
function getStrategy(sectionType: string): ParseStrategy {
  const category = getSectionCategory(sectionType);
  switch (category) {
    case 'wine':
      return wineStrategy;
    case 'beer':
      return beerStrategy;
    case 'spirits':
      return spiritsStrategy;
    case 'cocktail':
      return cocktailStrategy;
    case 'sake':
      return sakeStrategy;
    default:
      // Default to wine strategy as it's the most comprehensive
      return wineStrategy;
  }
}

/**
 * Parse a menu section's OCR words into structured line items.
 *
 * @param section - The section metadata (bbox, type)
 * @param allPhotoWords - All OCR words for the photo
 * @returns Parsed items with hierarchy info
 */
export function parseSection(
  section: SectionInfo,
  allPhotoWords: WordData[]
): SectionParseResult {
  const errors: string[] = [];

  // Step 1: Filter words to section bbox
  const sectionBBox = {
    x0: section.bbox_x0,
    y0: section.bbox_y0,
    x1: section.bbox_x1,
    y1: section.bbox_y1,
  };
  const sectionWords = filterWordsInSection(allPhotoWords, sectionBBox);

  if (sectionWords.length === 0) {
    return {
      items: [],
      strategy: 'none',
      lineCount: 0,
      errors: ['No OCR words found within section bounding box'],
    };
  }

  // Step 2: Group into lines
  const lines = groupWordsIntoLines(sectionWords);

  if (lines.length === 0) {
    return {
      items: [],
      strategy: 'none',
      lineCount: 0,
      errors: ['No lines could be formed from words'],
    };
  }

  // Step 3: Dispatch to strategy
  const strategy = getStrategy(section.section_type);
  let items = strategy.parse(lines);

  // Step 4: Build hierarchy (assign parent references)
  const hierarchyMap = buildHierarchy(items);

  // Attach hierarchy info (as _parentIndex for now — actual IDs assigned at DB insert time)
  for (let i = 0; i < items.length; i++) {
    const parentIdx = hierarchyMap.get(i);
    if (parentIdx !== undefined && parentIdx >= 0) {
      // Store parent index temporarily; API route will resolve to actual UUIDs
      (items[i] as any)._parentIndex = parentIdx;
    }
  }

  // Step 5: Post-parse validation — flag line items missing prices
  // If most line items in the section have prices, any without one likely had
  // an OCR issue and should be flagged for manual review.
  const lineItems = items.filter(i => i.item_type === 'line_item');
  const withPrice = lineItems.filter(i => i.price != null);

  if (lineItems.length > 0 && withPrice.length / lineItems.length >= 0.5) {
    const missing = lineItems.filter(i => i.price == null);
    for (const item of missing) {
      item.notes = item.notes
        ? `${item.notes} | PRICE MISSING — most items in this section have prices`
        : 'PRICE MISSING — most items in this section have prices';
    }
    if (missing.length > 0) {
      errors.push(`${missing.length} line item(s) missing price in a section where most items are priced`);
    }
  }

  return {
    items,
    strategy: strategy.name,
    lineCount: lines.length,
    errors,
  };
}

export { getSectionCategory, getProductCategory } from './types';
export type { WordData, SectionInfo, SectionParseResult, ParsedMenuItem } from './types';
