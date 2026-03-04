/**
 * Product Seeder
 * Generates dedupe keys for menu items and finds or creates products
 * in the master product catalog.
 */

import { STOP_WORDS } from './reference-data';

/**
 * Generate a canonical dedupe key for a product.
 *
 * Algorithm:
 * 1. Collect non-null fields: producer, varietal, appellation, vintage, format
 * 2. Lowercase, strip punctuation, remove stop words
 * 3. Normalize format (half bottle → 375ml, magnum → 1500ml)
 * 4. Sort tokens alphabetically
 * 5. Concatenate with spaces
 */
export function generateDedupeKey(fields: {
  item_name?: string | null;
  producer?: string | null;
  varietal?: string | null;
  appellation?: string | null;
  vintage?: number | null;
  format?: string | null;
}): string {
  const parts: string[] = [];

  // Collect non-null fields
  if (fields.producer) parts.push(fields.producer);
  if (fields.item_name) parts.push(fields.item_name);
  if (fields.varietal) parts.push(fields.varietal);
  if (fields.appellation) parts.push(fields.appellation);
  if (fields.vintage && fields.vintage > 0) parts.push(String(fields.vintage));
  if (fields.format) parts.push(fields.format);

  // Join, lowercase, strip punctuation
  let combined = parts.join(' ').toLowerCase();
  combined = combined.replace(/[''"`,.;:!?()[\]{}\/\\]/g, '');
  combined = combined.replace(/[-–—]/g, ' ');

  // Split into tokens, remove stop words, sort
  const tokens = combined
    .split(/\s+/)
    .filter(t => t.length > 0 && !STOP_WORDS.has(t));

  tokens.sort();

  return tokens.join(' ');
}

/**
 * Build the product name from available fields.
 */
export function buildProductName(fields: {
  item_name?: string | null;
  producer?: string | null;
  varietal?: string | null;
  appellation?: string | null;
  vintage?: number | null;
}): string {
  const parts: string[] = [];

  if (fields.producer) parts.push(fields.producer);
  if (fields.item_name && fields.item_name !== fields.producer) parts.push(fields.item_name);
  if (fields.varietal) parts.push(fields.varietal);
  if (fields.appellation) parts.push(fields.appellation);
  if (fields.vintage && fields.vintage > 0) parts.push(String(fields.vintage));

  return parts.join(' ').trim() || 'Unknown Product';
}

/**
 * Build a product record suitable for inserting into the products table.
 */
export function buildProductRecord(fields: {
  item_name?: string | null;
  producer?: string | null;
  varietal?: string | null;
  appellation?: string | null;
  vintage?: number | null;
  format?: string | null;
  category: string;
}) {
  const dedupe_key = generateDedupeKey(fields);
  const name = buildProductName(fields);

  return {
    name,
    producer: fields.producer || null,
    varietal: fields.varietal || null,
    appellation: fields.appellation || null,
    vintage: fields.vintage && fields.vintage > 0 ? fields.vintage : null,
    format: fields.format || null,
    category: fields.category,
    source: 'ocr_discovery' as const,
    dedupe_key,
  };
}
