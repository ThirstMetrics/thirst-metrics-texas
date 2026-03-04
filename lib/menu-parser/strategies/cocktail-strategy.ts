/**
 * Cocktail Strategy
 * Parses cocktail sections.
 *
 * Cocktail menus typically have:
 * - Name + description + price
 * - Description may be on a continuation line
 * - Simpler structure, fewer fields to extract
 */

import { ParsedLine, ParsedMenuItem, ParseStrategy } from '../types';
import { classifyLines } from '../classifier';
import { extractFields } from '../field-extractor';

export const cocktailStrategy: ParseStrategy = {
  name: 'cocktail',

  parse(lines: ParsedLine[]): ParsedMenuItem[] {
    const classifications = classifyLines(lines);
    const items: ParsedMenuItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const itemType = classifications[i];

      if (itemType === 'noise') continue;

      if (itemType !== 'line_item') {
        items.push({
          item_type: itemType,
          sort_order: i,
          raw_text: line.text,
          bin_number: null,
          item_name: line.text,
          producer: null,
          varietal: null,
          appellation: null,
          vintage: null,
          format: null,
          price: null,
          price_text: null,
          notes: null,
          _lineIndex: i,
        });
      } else {
        const fields = extractFields(line.text, 'cocktail');
        items.push({
          item_type: 'line_item',
          sort_order: i,
          raw_text: line.text,
          bin_number: null,
          item_name: fields.item_name,
          producer: null,
          varietal: null,
          appellation: null,
          vintage: null,
          format: null,
          price: fields.price,
          price_text: fields.price_text,
          notes: fields.notes,
          _lineIndex: i,
        });
      }
    }

    return items;
  },
};
