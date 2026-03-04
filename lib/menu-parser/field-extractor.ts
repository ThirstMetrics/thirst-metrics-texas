/**
 * Field Extractor
 * Extracts structured fields from a line of menu text using ordered extraction.
 * Each step removes consumed tokens to avoid double-matching.
 *
 * Extraction order:
 * 1. Price (rightmost price pattern)
 * 2. Bin number (leading small integer)
 * 3. Vintage (4-digit year 1900-2030 or "NV")
 * 4. Format (375ml, magnum, etc.)
 * 5. Varietal (match against known grapes)
 * 6. Appellation (match against known regions)
 * 7. Remaining text → item_name / producer
 */

import {
  WINE_VARIETALS,
  APPELLATIONS,
  FORMAT_PATTERNS,
  SAKE_GRADES,
  BEER_STYLES,
} from './reference-data';

export interface ExtractedFields {
  price: number | null;
  price_text: string | null;
  bin_number: string | null;
  vintage: number | null;
  format: string | null;
  varietal: string | null;
  appellation: string | null;
  item_name: string | null;
  producer: string | null;
  notes: string | null;
}

/**
 * Extract structured fields from a line of text.
 * Mutates a working copy of the text, removing consumed tokens at each step.
 */
export function extractFields(text: string, sectionType: string): ExtractedFields {
  let remaining = text.trim();
  const result: ExtractedFields = {
    price: null,
    price_text: null,
    bin_number: null,
    vintage: null,
    format: null,
    varietal: null,
    appellation: null,
    item_name: null,
    producer: null,
    notes: null,
  };

  // Step 0: Strip trailing OCR garbage (single letters, pipes, stray punctuation)
  // that would prevent price extraction. E.g. "300 |" or "2018 a"
  remaining = remaining.replace(/\s+[|\\\/!@#%^&*]+\s*$/, '').trim();
  remaining = remaining.replace(/\s+[a-zA-Z]\s*$/, '').trim();

  // Step 1: Extract price (rightmost match)
  // Reject values that look like vintages (1900-2039) unless preceded by $
  const priceMatch = remaining.match(/(\$)\s*(\d[\d,]*(?:\.\d{1,2})?)\s*$/) ||
                     remaining.match(/\s(\d[\d,]*(?:\.\d{1,2})?)\s*$/);
  if (priceMatch) {
    const hasDollarSign = priceMatch[0].includes('$');
    const priceIdx = priceMatch[1] === '$' ? 2 : 1;
    const priceStr = priceMatch[priceIdx].replace(/,/g, '');
    const priceVal = parseFloat(priceStr);
    // Without a $ sign, reject values in vintage range (1900-2039) — likely a year, not a price
    const looksLikeVintage = !hasDollarSign && priceVal >= 1900 && priceVal <= 2039 && Number.isInteger(priceVal);
    if (!looksLikeVintage) {
      result.price = priceVal;
      result.price_text = priceMatch[0].trim();
      remaining = remaining.slice(0, priceMatch.index).trim();
    }
  }

  // Also handle dual-price format like "14/28" or "$14/$28"
  if (!result.price) {
    const dualPriceMatch = remaining.match(/\$?\s*(\d+)\s*\/\s*\$?\s*(\d+)\s*$/);
    if (dualPriceMatch) {
      // Use the larger price (by-the-bottle usually)
      const p1 = parseFloat(dualPriceMatch[1]);
      const p2 = parseFloat(dualPriceMatch[2]);
      result.price = Math.max(p1, p2);
      result.price_text = dualPriceMatch[0].trim();
      remaining = remaining.slice(0, dualPriceMatch.index).trim();
    }
  }

  // Step 2: Extract bin number (leading integer, 1-4 digits)
  // Bin numbers appear at the start of wine list lines (e.g. 1053, 1318, 1488).
  // They are not analytically valuable but need to be captured and stripped.
  const binMatch = remaining.match(/^(\d{1,4})\s+/);
  if (binMatch) {
    result.bin_number = binMatch[1];
    remaining = remaining.slice(binMatch[0].length).trim();
  }

  // Step 3: Extract vintage (4-digit year 1900-2030 or "NV")
  const nvMatch = remaining.match(/\bNV\b/i);
  if (nvMatch) {
    result.vintage = 0; // NV represented as 0
    remaining = remaining.replace(nvMatch[0], '').trim();
  } else {
    const vintageMatch = remaining.match(/\b(19\d{2}|20[0-3]\d)\b/);
    if (vintageMatch) {
      result.vintage = parseInt(vintageMatch[1], 10);
      remaining = remaining.replace(vintageMatch[0], '').trim();
    }
  }

  // Step 4: Extract format
  for (const { pattern, normalized } of FORMAT_PATTERNS) {
    const fmtMatch = remaining.match(pattern);
    if (fmtMatch) {
      result.format = normalized;
      remaining = remaining.replace(fmtMatch[0], '').trim();
      break;
    }
  }

  // Step 5: Extract varietal (longest match first)
  const remainingLower = remaining.toLowerCase();
  let bestVarietal: string | null = null;
  let bestVarietalLen = 0;

  for (const varietal of WINE_VARIETALS) {
    if (remainingLower.includes(varietal) && varietal.length > bestVarietalLen) {
      bestVarietal = varietal;
      bestVarietalLen = varietal.length;
    }
  }

  if (bestVarietal) {
    result.varietal = bestVarietal;
    // Remove the varietal from remaining text (case-insensitive)
    const idx = remainingLower.indexOf(bestVarietal);
    remaining = (remaining.slice(0, idx) + remaining.slice(idx + bestVarietalLen)).trim();
  }

  // Step 6: Extract appellation (longest match first)
  const remainingLower2 = remaining.toLowerCase();
  let bestAppellation: string | null = null;
  let bestAppLen = 0;

  for (const appellation of APPELLATIONS) {
    if (remainingLower2.includes(appellation) && appellation.length > bestAppLen) {
      bestAppellation = appellation;
      bestAppLen = appellation.length;
    }
  }

  if (bestAppellation) {
    result.appellation = bestAppellation;
    const idx = remainingLower2.indexOf(bestAppellation);
    remaining = (remaining.slice(0, idx) + remaining.slice(idx + bestAppLen)).trim();
  }

  // Step 7: Remaining text → item_name (and potentially producer)
  // Clean up extra whitespace and punctuation artifacts
  remaining = remaining.replace(/\s{2,}/g, ' ').replace(/^[,.\-–—]+\s*/, '').replace(/\s*[,.\-–—]+$/, '').trim();

  if (remaining) {
    // Try to split producer / item name by comma or dash
    const commaIdx = remaining.indexOf(',');
    if (commaIdx > 0 && commaIdx < remaining.length - 1) {
      result.producer = remaining.slice(0, commaIdx).trim();
      result.item_name = remaining.slice(commaIdx + 1).trim();
    } else {
      result.item_name = remaining;
    }
  }

  return result;
}

/**
 * Extract fields specifically for beer lines.
 * Looks for brewery, style, ABV% patterns.
 */
export function extractBeerFields(text: string): ExtractedFields {
  const base = extractFields(text, 'beer');

  // Try to extract ABV
  const remaining = text;
  const abvMatch = remaining.match(/(\d+(?:\.\d+)?)\s*%\s*(?:abv)?/i);
  if (abvMatch) {
    base.notes = `${abvMatch[1]}% ABV`;
  }

  // Try to match beer style
  const lower = (base.item_name || '').toLowerCase();
  for (const style of BEER_STYLES) {
    if (lower.includes(style)) {
      base.varietal = style; // repurpose varietal field for beer style
      break;
    }
  }

  return base;
}

/**
 * Extract fields for sake lines.
 * Looks for grade and serving temperature.
 */
export function extractSakeFields(text: string): ExtractedFields {
  const base = extractFields(text, 'sake');

  // Try to match sake grade
  const lower = (base.item_name || text).toLowerCase();
  for (const grade of SAKE_GRADES) {
    if (lower.includes(grade)) {
      base.varietal = grade; // repurpose varietal field for sake grade
      break;
    }
  }

  return base;
}
