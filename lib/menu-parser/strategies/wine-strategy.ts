/**
 * Wine Strategy
 * Parses wine list sections: wine_list, wines_by_glass, large_format_wine, small_format_wine.
 *
 * Wine menus typically have:
 * - Hierarchical headers (region, varietal, format categories)
 * - Multi-column layout: bin#, wine name, producer, vintage, price
 * - Descriptions may span continuation lines
 */

import { ParsedLine, ParsedMenuItem, ParseStrategy } from '../types';
import { classifyLines } from '../classifier';
import { extractFields } from '../field-extractor';

export const wineStrategy: ParseStrategy = {
  name: 'wine',

  parse(lines: ParsedLine[]): ParsedMenuItem[] {
    const classifications = classifyLines(lines);
    const items: ParsedMenuItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const itemType = classifications[i];

      if (itemType === 'noise') continue;

      if (itemType !== 'line_item') {
        // Header — just capture the text
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
        // Line item — extract fields
        const fields = extractFields(line.text, 'wine');
        items.push({
          item_type: 'line_item',
          sort_order: i,
          raw_text: line.text,
          bin_number: fields.bin_number,
          item_name: fields.item_name,
          producer: fields.producer,
          varietal: fields.varietal,
          appellation: fields.appellation,
          vintage: fields.vintage,
          format: fields.format,
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
