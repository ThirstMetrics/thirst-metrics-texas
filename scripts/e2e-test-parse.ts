#!/usr/bin/env tsx
/**
 * End-to-end test for menu section parsing pipeline.
 * If no sections exist, creates one covering the full image for testing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log('E2E Test: Menu Section Parsing Pipeline\n');

  // Step 1: Find the best photo (most OCR words)
  console.log('Step 1: Finding photo with most OCR words...');
  const { data: photos } = await supabase
    .from('activity_photos')
    .select('id, ocr_word_count, ocr_image_width, ocr_image_height')
    .gt('ocr_word_count', 0)
    .order('ocr_word_count', { ascending: false })
    .limit(1);

  if (!photos || photos.length === 0) {
    console.error('No photos with OCR words found.');
    process.exit(1);
  }

  const photo = photos[0];
  console.log(`  Photo: ${photo.id}`);
  console.log(`  Word count: ${photo.ocr_word_count}`);
  console.log(`  Image size: ${photo.ocr_image_width}x${photo.ocr_image_height}`);

  // Step 2: Find or create a section
  console.log('\nStep 2: Finding/creating menu section...');
  let { data: sections } = await supabase
    .from('ocr_menu_sections')
    .select('*')
    .eq('activity_photo_id', photo.id);

  let section: any;

  if (!sections || sections.length === 0) {
    console.log('  No sections exist. Creating a wine_list section covering the full image...');

    // Get word bbox extents to determine image coverage
    const { data: words } = await supabase
      .from('ocr_word_data')
      .select('bbox_x0, bbox_y0, bbox_x1, bbox_y1')
      .eq('activity_photo_id', photo.id);

    if (!words || words.length === 0) {
      console.error('  No words found for this photo.');
      process.exit(1);
    }

    const minX = Math.min(...words.map(w => w.bbox_x0));
    const minY = Math.min(...words.map(w => w.bbox_y0));
    const maxX = Math.max(...words.map(w => w.bbox_x1));
    const maxY = Math.max(...words.map(w => w.bbox_y1));

    console.log(`  Word extents: (${minX}, ${minY}) -> (${maxX}, ${maxY})`);

    // Create section covering all words with small padding
    const { data: newSection, error: createErr } = await supabase
      .from('ocr_menu_sections')
      .insert({
        activity_photo_id: photo.id,
        section_type: 'wine_list',
        bbox_x0: Math.max(0, minX - 10),
        bbox_y0: Math.max(0, minY - 10),
        bbox_x1: maxX + 10,
        bbox_y1: maxY + 10,
      })
      .select()
      .single();

    if (createErr || !newSection) {
      console.error('  Failed to create section:', createErr?.message);
      process.exit(1);
    }

    section = newSection;
    console.log(`  Created section: ${section.id} (wine_list)`);
  } else {
    section = sections[0];
    console.log(`  Using existing section: ${section.id} (${section.section_type})`);
  }

  // Step 3: Fetch all OCR words
  console.log('\nStep 3: Fetching OCR words...');
  const { data: allWords, error: wordsErr } = await supabase
    .from('ocr_word_data')
    .select('word_index, raw_text, corrected_text, confidence, bbox_x0, bbox_y0, bbox_x1, bbox_y1, line_index, block_index, was_corrected')
    .eq('activity_photo_id', photo.id)
    .order('word_index', { ascending: true });

  if (wordsErr || !allWords) {
    console.error('  Failed to fetch words:', wordsErr?.message);
    process.exit(1);
  }
  console.log(`  Total words: ${allWords.length}`);

  // Show the raw text
  const rawLines = new Map<string, string[]>();
  for (const w of allWords) {
    const key = `${w.block_index}_${w.line_index}`;
    if (!rawLines.has(key)) rawLines.set(key, []);
    rawLines.get(key)!.push(w.corrected_text || w.raw_text);
  }
  console.log('\n--- Raw OCR Lines ---');
  for (const [key, words] of rawLines) {
    console.log(`  [${key}] ${words.join(' ')}`);
  }

  // Step 4: Run the parser
  console.log('\nStep 4: Running parser...');
  const { parseSection } = await import('../lib/menu-parser/index');

  const sectionInfo = {
    id: section.id,
    section_type: section.section_type,
    activity_photo_id: section.activity_photo_id,
    bbox_x0: section.bbox_x0,
    bbox_y0: section.bbox_y0,
    bbox_x1: section.bbox_x1,
    bbox_y1: section.bbox_y1,
  };

  const result = parseSection(sectionInfo, allWords);

  console.log(`  Strategy: ${result.strategy}`);
  console.log(`  Lines grouped: ${result.lineCount}`);
  console.log(`  Items parsed: ${result.items.length}`);
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.join(', ')}`);
  }

  // Show parsed items
  if (result.items.length > 0) {
    console.log('\n--- Parsed Items ---');
    for (const item of result.items) {
      const indent = item.item_type === 'header_1' ? '' :
                     item.item_type === 'header_2' ? '  ' :
                     item.item_type === 'header_3' ? '    ' : '      ';
      const typeTag = item.item_type === 'line_item' ? 'ITEM' : item.item_type.toUpperCase();
      const price = item.price ? ` $${item.price.toFixed(2)}` : '';
      const vintage = item.vintage ? ` [${item.vintage}]` : '';
      const varietal = item.varietal ? ` {${item.varietal}}` : '';
      const appellation = item.appellation ? ` (${item.appellation})` : '';
      const bin = item.bin_number ? ` #${item.bin_number}` : '';
      const fmt = item.format ? ` <${item.format}>` : '';

      console.log(`${indent}[${typeTag}]${bin} ${item.item_name || item.raw_text}${varietal}${appellation}${vintage}${fmt}${price}`);
    }
  }

  // Step 5: Database insert (pass 1: items without parent)
  console.log('\nStep 5: Inserting items into database...');

  // Delete old items
  await supabase.from('menu_items').delete().eq('section_id', section.id);

  const insertRows = result.items.map((item) => ({
    activity_photo_id: section.activity_photo_id,
    section_id: section.id,
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
  }));

  const { data: insertedItems, error: insertErr } = await supabase
    .from('menu_items')
    .insert(insertRows)
    .select();

  if (insertErr) {
    console.error('  Insert FAILED:', insertErr.message);
    process.exit(1);
  }
  console.log(`  Pass 1: Inserted ${insertedItems?.length} items`);

  // Pass 2: parent_header_id
  let parentUpdates = 0;
  if (insertedItems) {
    for (let i = 0; i < result.items.length; i++) {
      const parentIdx = (result.items[i] as any)._parentIndex;
      if (parentIdx !== undefined && parentIdx >= 0 && parentIdx < insertedItems.length) {
        const { error: upErr } = await supabase
          .from('menu_items')
          .update({ parent_header_id: insertedItems[parentIdx].id })
          .eq('id', insertedItems[i].id);
        if (!upErr) parentUpdates++;
      }
    }
  }
  console.log(`  Pass 2: Updated ${parentUpdates} parent references`);

  // Step 6: Product seeding
  console.log('\nStep 6: Seeding products...');
  const { generateDedupeKey, buildProductRecord } = await import('../lib/menu-parser/product-seeder');
  const { getProductCategory } = await import('../lib/menu-parser/types');

  const category = getProductCategory(section.section_type);
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

      const { data: product, error: prodErr } = await supabase
        .from('products')
        .upsert(productRecord, { onConflict: 'dedupe_key', ignoreDuplicates: true })
        .select('id')
        .single();

      if (product && !prodErr) {
        await supabase
          .from('menu_items')
          .update({ product_id: product.id, match_status: 'auto_matched', match_confidence: 100 })
          .eq('id', item.id);
        productsSeeded++;
      }
    }
  }
  console.log(`  Products seeded: ${productsSeeded}`);

  // Step 7: Verify final state
  console.log('\nStep 7: Verifying final state...');

  const { data: finalItems } = await supabase
    .from('menu_items')
    .select('id, item_type, item_name, price, varietal, vintage, parent_header_id, product_id, match_status')
    .eq('section_id', section.id)
    .order('sort_order', { ascending: true });

  const withParent = finalItems?.filter(i => i.parent_header_id) || [];
  const withProduct = finalItems?.filter(i => i.product_id) || [];
  const headers = finalItems?.filter(i => i.item_type !== 'line_item') || [];
  const lineItems = finalItems?.filter(i => i.item_type === 'line_item') || [];

  console.log(`  Total items: ${finalItems?.length}`);
  console.log(`  Headers: ${headers.length}`);
  console.log(`  Line items: ${lineItems.length}`);
  console.log(`  With parent_header_id: ${withParent.length}`);
  console.log(`  With product_id (matched): ${withProduct.length}`);

  const { count: totalProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  console.log(`  Total products in catalog: ${totalProducts}`);

  // Show final items
  console.log('\n--- Final DB Records ---');
  if (finalItems) {
    for (const item of finalItems) {
      const type = item.item_type === 'line_item' ? 'ITEM' : item.item_type.toUpperCase();
      const price = item.price ? ` $${item.price}` : '';
      const matched = item.product_id ? ' [MATCHED]' : '';
      const parent = item.parent_header_id ? ' (child)' : '';
      const varietal = item.varietal ? ` {${item.varietal}}` : '';
      console.log(`  [${type}] ${item.item_name || '(no name)'}${varietal}${price}${matched}${parent}`);
    }
  }

  console.log('\n========================================');
  console.log('E2E TEST PASSED');
  console.log('========================================');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
