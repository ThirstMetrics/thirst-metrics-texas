/**
 * Menu Parser Type Definitions
 * Types for parsing OCR words within menu sections into structured line items.
 */

// ============================================
// Input types (from OCR word data)
// ============================================

export interface WordData {
  word_index: number;
  raw_text: string;
  corrected_text: string;
  confidence: number;
  bbox_x0: number;
  bbox_y0: number;
  bbox_x1: number;
  bbox_y1: number;
  line_index: number;
  block_index: number;
  was_corrected: boolean;
}

export interface SectionBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface SectionInfo {
  id: string;
  section_type: string;
  activity_photo_id: string;
  bbox_x0: number;
  bbox_y0: number;
  bbox_x1: number;
  bbox_y1: number;
}

// ============================================
// Parsed line types
// ============================================

export type ItemType = 'header_1' | 'header_2' | 'header_3' | 'line_item';

export interface ParsedLine {
  /** Words that belong to this line */
  words: WordData[];
  /** Concatenated text of the line */
  text: string;
  /** Average Y position (top of bbox) for sorting */
  avgY: number;
  /** Average height of the line */
  height: number;
  /** Block index this line belongs to */
  blockIndex: number;
  /** Line index within the block */
  lineIndex: number;
}

export interface ParsedMenuItem {
  item_type: ItemType;
  sort_order: number;
  raw_text: string;
  bin_number: string | null;
  item_name: string | null;
  producer: string | null;
  varietal: string | null;
  appellation: string | null;
  vintage: number | null;
  format: string | null;
  price: number | null;
  price_text: string | null;
  notes: string | null;
  /** Temporary reference for header hierarchy building */
  _lineIndex: number;
}

// ============================================
// Parse result
// ============================================

export interface SectionParseResult {
  items: ParsedMenuItem[];
  strategy: string;
  lineCount: number;
  errors: string[];
}

// ============================================
// Strategy interface
// ============================================

export interface ParseStrategy {
  name: string;
  parse(lines: ParsedLine[]): ParsedMenuItem[];
}

// ============================================
// Section type → strategy mapping
// ============================================

export type SectionCategory = 'wine' | 'beer' | 'spirits' | 'cocktail' | 'sake' | 'other';

export function getSectionCategory(sectionType: string): SectionCategory {
  switch (sectionType) {
    case 'wine_list':
    case 'wines_by_glass':
    case 'large_format_wine':
    case 'small_format_wine':
      return 'wine';
    case 'draft_beers':
    case 'bottled_beers':
      return 'beer';
    case 'spirits_list':
      return 'spirits';
    case 'cocktails':
      return 'cocktail';
    case 'sake_by_glass':
    case 'sake_by_bottle':
      return 'sake';
    default:
      return 'other';
  }
}

/** Map section type to product category */
export function getProductCategory(sectionType: string): string {
  const cat = getSectionCategory(sectionType);
  if (cat === 'cocktail') return 'cocktail';
  return cat;
}
