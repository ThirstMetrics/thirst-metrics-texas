/**
 * Parse Menu Section API Route
 * POST /api/admin/ocr/sections/[sectionId]/parse
 *
 * Triggers parsing of a menu section's OCR words into structured line items.
 * Deletes existing items for the section before re-parsing fresh.
 *
 * Two-pass insert for self-referencing FK:
 * 1. Insert all items without parent_header_id
 * 2. Batch-update parent references using collected UUIDs
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseSection } from '@/lib/menu-parser';
import { getProductCategory } from '@/lib/menu-parser/types';
import { buildProductRecord, generateDedupeKey } from '@/lib/menu-parser/product-seeder';
import type { WordData } from '@/lib/menu-parser/types';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { sectionId: string } }
) {
  try {
    const { sectionId } = params;

    if (!sectionId) {
      return NextResponse.json(
        { error: 'sectionId is required' },
        { status: 400 }
      );
    }

    // 1. Fetch the section metadata
    const { data: section, error: sectionError } = await supabaseAdmin
      .from('ocr_menu_sections')
      .select('*')
      .eq('id', sectionId)
      .single();

    if (sectionError || !section) {
      return NextResponse.json(
        { error: 'Section not found' },
        { status: 404 }
      );
    }

    // 2. Fetch all OCR words for this photo
    const { data: wordRows, error: wordsError } = await supabaseAdmin
      .from('ocr_word_data')
      .select('word_index, raw_text, corrected_text, confidence, bbox_x0, bbox_y0, bbox_x1, bbox_y1, line_index, block_index, was_corrected')
      .eq('activity_photo_id', section.activity_photo_id)
      .order('word_index', { ascending: true });

    if (wordsError) {
      console.error('[Parse API] Failed to fetch words:', wordsError.message);
      return NextResponse.json(
        { error: `Failed to fetch OCR words: ${wordsError.message}` },
        { status: 500 }
      );
    }

    if (!wordRows || wordRows.length === 0) {
      return NextResponse.json(
        { error: 'No OCR words found for this photo. Run OCR first.' },
        { status: 400 }
      );
    }

    // 3. Parse the section
    const sectionInfo = {
      id: section.id,
      section_type: section.section_type,
      activity_photo_id: section.activity_photo_id,
      bbox_x0: section.bbox_x0,
      bbox_y0: section.bbox_y0,
      bbox_x1: section.bbox_x1,
      bbox_y1: section.bbox_y1,
    };

    const allWords: WordData[] = wordRows.map((w: any) => ({
      word_index: w.word_index,
      raw_text: w.raw_text,
      corrected_text: w.corrected_text,
      confidence: w.confidence,
      bbox_x0: w.bbox_x0,
      bbox_y0: w.bbox_y0,
      bbox_x1: w.bbox_x1,
      bbox_y1: w.bbox_y1,
      line_index: w.line_index,
      block_index: w.block_index,
      was_corrected: w.was_corrected,
    }));

    const parseResult = parseSection(sectionInfo, allWords);

    if (parseResult.items.length === 0) {
      return NextResponse.json({
        items: [],
        strategy: parseResult.strategy,
        lineCount: parseResult.lineCount,
        errors: parseResult.errors,
      });
    }

    // 4. Delete existing menu items for this section
    const { error: deleteError } = await supabaseAdmin
      .from('menu_items')
      .delete()
      .eq('section_id', sectionId);

    if (deleteError) {
      console.error('[Parse API] Failed to delete old items:', deleteError.message);
      // Non-fatal — may be first parse
    }

    // 5. Pass 1: Insert all items WITHOUT parent_header_id
    const category = getProductCategory(section.section_type);
    const insertRows = parseResult.items.map((item, idx) => ({
      activity_photo_id: section.activity_photo_id,
      section_id: sectionId,
      item_type: item.item_type,
      sort_order: item.sort_order,
      raw_text: item.raw_text,
      bin_number: item.bin_number,
      item_name: item.item_name,
      producer: item.producer,
      varietal: item.varietal,
      appellation: item.appellation,
      vintage: item.vintage && item.vintage > 0 ? item.vintage : null,
      format: item.format,
      price: item.price,
      price_text: item.price_text,
      notes: item.notes,
      // parent_header_id will be set in pass 2
    }));

    const { data: insertedItems, error: insertError } = await supabaseAdmin
      .from('menu_items')
      .insert(insertRows)
      .select();

    if (insertError) {
      console.error('[Parse API] Failed to insert items:', insertError.message);
      return NextResponse.json(
        { error: `Failed to insert parsed items: ${insertError.message}` },
        { status: 500 }
      );
    }

    // 6. Pass 2: Update parent_header_id references
    if (insertedItems && insertedItems.length > 0) {
      const updates: Array<{ id: string; parent_header_id: string }> = [];

      for (let i = 0; i < parseResult.items.length; i++) {
        const parentIdx = (parseResult.items[i] as any)._parentIndex;
        if (parentIdx !== undefined && parentIdx >= 0 && parentIdx < insertedItems.length) {
          updates.push({
            id: insertedItems[i].id,
            parent_header_id: insertedItems[parentIdx].id,
          });
        }
      }

      // Batch update parent references
      for (const update of updates) {
        await supabaseAdmin
          .from('menu_items')
          .update({ parent_header_id: update.parent_header_id })
          .eq('id', update.id);
      }
    }

    // 7. Auto-seed products for qualifying line items
    let productsSeeded = 0;
    if (insertedItems) {
      for (const item of insertedItems) {
        if (item.item_type !== 'line_item') continue;
        if (!item.price && !item.item_name) continue;

        const dedupeKey = generateDedupeKey({
          item_name: item.item_name,
          producer: item.producer,
          varietal: item.varietal,
          appellation: item.appellation,
          vintage: item.vintage,
          format: item.format,
        });

        if (!dedupeKey) continue;

        const productRecord = buildProductRecord({
          item_name: item.item_name,
          producer: item.producer,
          varietal: item.varietal,
          appellation: item.appellation,
          vintage: item.vintage,
          format: item.format,
          category,
        });

        // Upsert: skip if dedupe_key already exists
        const { data: product, error: productError } = await supabaseAdmin
          .from('products')
          .upsert(productRecord, { onConflict: 'dedupe_key', ignoreDuplicates: true })
          .select('id')
          .single();

        if (product && !productError) {
          // Link the menu item to the product
          await supabaseAdmin
            .from('menu_items')
            .update({
              product_id: product.id,
              match_status: 'auto_matched',
              match_confidence: 100,
            })
            .eq('id', item.id);
          productsSeeded++;
        }
      }
    }

    // Re-fetch items with parent references resolved
    const { data: finalItems } = await supabaseAdmin
      .from('menu_items')
      .select('*')
      .eq('section_id', sectionId)
      .order('sort_order', { ascending: true });

    return NextResponse.json({
      items: finalItems || [],
      strategy: parseResult.strategy,
      lineCount: parseResult.lineCount,
      productsSeeded,
      errors: parseResult.errors,
    });
  } catch (error: any) {
    console.error('[Parse API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to parse section' },
      { status: 500 }
    );
  }
}
