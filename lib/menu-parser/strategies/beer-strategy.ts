/**
 * Beer Strategy
 * Parses beer sections: draft_beers, bottled_beers.
 *
 * Beer menus typically have:
 * - Name + brewery + style + ABV% + price
 * - Simpler header structure (categories, tap handles)
 */

import { ParsedLine, ParsedMenuItem, ParseStrategy } from '../types';
import { classifyLines } from '../classifier';
import { extractBeerFields } from '../field-extractor';

export const beerStrategy: ParseStrategy = {
  name: 'beer',

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
        const fields = extractBeerFields(line.text);
        items.push({
          item_type: 'line_item',
          sort_order: i,
          raw_text: line.text,
          bin_number: null,
          item_name: fields.item_name,
          producer: fields.producer,
          varietal: fields.varietal, // beer style
          appellation: null,
          vintage: null,
          format: fields.format,
          price: fields.price,
          price_text: fields.price_text,
          notes: fields.notes, // ABV
          _lineIndex: i,
        });
      }
    }

    return items;
  },
};
