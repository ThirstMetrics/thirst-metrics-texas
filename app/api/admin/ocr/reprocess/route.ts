/**
 * Admin OCR Reprocess API Route
 * Batch re-process existing photos through the enhanced OCR pipeline.
 *
 * GET /api/admin/ocr/reprocess
 *   Returns stats about how many photos need reprocessing.
 *   Response: { needsReprocessing: number, total: number }
 *
 * POST /api/admin/ocr/reprocess
 *   Body: { photoIds?: string[], all?: boolean }
 *   - photoIds: Re-process specific photos by ID
 *   - all: true to re-process all legacy photos (have ocr_text but ocr_word_count is 0 or null)
 *   Photos are processed sequentially to avoid overloading Tesseract.
 *   Response: { processed: number, failed: number, errors: string[] }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { OCRWord } from '@thirst-metrics/ocr-engine';
import { getPipeline } from '@/lib/ocr/pipeline-cache';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';

/**
 * Store word-level OCR data into the ocr_word_data table.
 * Batch upserts in chunks of 100 to avoid payload size limits.
 */
async function storeWordData(activityPhotoId: string, words: OCRWord[]): Promise<void> {
  const BATCH_SIZE = 100;
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE).map(w => ({
      activity_photo_id: activityPhotoId,
      word_index: w.index,
      raw_text: w.rawText,
      corrected_text: w.correctedText,
      confidence: w.confidence,
      bbox_x0: w.bbox.x0,
      bbox_y0: w.bbox.y0,
      bbox_x1: w.bbox.x1,
      bbox_y1: w.bbox.y1,
      line_index: w.lineIndex,
      block_index: w.blockIndex,
      was_corrected: w.wasCorrected,
      correction_source: w.correctionSource,
      dictionary_key: w.dictionaryKey,
    }));

    const { error } = await supabaseAdmin
      .from('ocr_word_data')
      .upsert(batch, { onConflict: 'activity_photo_id,word_index' });

    if (error) {
      console.error(`[Admin OCR Reprocess] storeWordData batch ${i}-${i + batch.length} error:`, error.message);
    }
  }
}

/**
 * Process a single photo through the OCR pipeline and store results.
 * Returns null on success, or an error message string on failure.
 */
async function reprocessPhoto(photo: { id: string; photo_url: string }): Promise<string | null> {
  try {
    const ocr = await getPipeline();
    const result = await ocr.processUrl(photo.photo_url);

    if (!result.success) {
      return `Photo ${photo.id}: OCR failed - ${result.error || 'unknown error'}`;
    }

    const correctionCount = result.corrections.length;
    const wordCount = result.words.length;

    // Update activity_photos with enhanced metadata
    const { error: updateError } = await supabaseAdmin
      .from('activity_photos')
      .update({
        ocr_text: result.correctedText,
        ocr_raw_text: result.rawText,
        ocr_processed_at: new Date().toISOString(),
        ocr_language: 'en',
        ocr_confidence: result.confidence,
        ocr_processing_time_ms: result.processingTimeMs,
        ocr_image_width: result.imageDimensions.width,
        ocr_image_height: result.imageDimensions.height,
        ocr_word_count: wordCount,
        ocr_correction_count: correctionCount,
        ocr_review_status: 'pending',
      })
      .eq('id', photo.id);

    if (updateError) {
      return `Photo ${photo.id}: DB update failed - ${updateError.message}`;
    }

    // Delete existing word data for this photo before storing new data
    const { error: deleteError } = await supabaseAdmin
      .from('ocr_word_data')
      .delete()
      .eq('activity_photo_id', photo.id);

    if (deleteError) {
      console.error(`[Admin OCR Reprocess] Delete old word data for ${photo.id} error:`, deleteError.message);
      // Continue anyway - upsert will handle conflicts
    }

    // Store word-level data
    if (result.words.length > 0) {
      await storeWordData(photo.id, result.words);
    }

    return null; // Success
  } catch (error: any) {
    return `Photo ${photo.id}: ${error.message || 'unexpected error'}`;
  }
}

/**
 * GET /api/admin/ocr/reprocess
 * Returns stats about how many photos need reprocessing.
 */
export async function GET() {
  try {
    // Count photos that have ocr_text but no word-level data (legacy photos)
    const { count: needsReprocessing, error: needsError } = await supabaseAdmin
      .from('activity_photos')
      .select('id', { count: 'exact', head: true })
      .not('ocr_text', 'is', null)
      .or('ocr_word_count.is.null,ocr_word_count.eq.0');

    if (needsError) {
      console.error('[Admin OCR Reprocess] Needs-reprocessing count error:', needsError.message);
      return NextResponse.json(
        { error: `Query failed: ${needsError.message}` },
        { status: 500 }
      );
    }

    // Count total photos with any OCR text
    const { count: total, error: totalError } = await supabaseAdmin
      .from('activity_photos')
      .select('id', { count: 'exact', head: true })
      .not('ocr_text', 'is', null);

    if (totalError) {
      console.error('[Admin OCR Reprocess] Total count error:', totalError.message);
      return NextResponse.json(
        { error: `Query failed: ${totalError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      needsReprocessing: needsReprocessing ?? 0,
      total: total ?? 0,
    });
  } catch (error: any) {
    console.error('[Admin OCR Reprocess] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch reprocessing stats' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/ocr/reprocess
 * Batch re-process photos through the enhanced OCR pipeline.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { photoIds, all } = body;

    // Validate input - must provide either photoIds or all
    if (!photoIds && !all) {
      return NextResponse.json(
        { error: 'Must provide either photoIds (string[]) or all (boolean)' },
        { status: 400 }
      );
    }

    if (photoIds && !Array.isArray(photoIds)) {
      return NextResponse.json(
        { error: 'photoIds must be an array of strings' },
        { status: 400 }
      );
    }

    if (photoIds && photoIds.length === 0) {
      return NextResponse.json(
        { error: 'photoIds array must not be empty' },
        { status: 400 }
      );
    }

    let photos: { id: string; photo_url: string }[] = [];

    if (photoIds) {
      // Fetch specific photos by ID
      const { data, error } = await supabaseAdmin
        .from('activity_photos')
        .select('id, photo_url')
        .in('id', photoIds);

      if (error) {
        console.error('[Admin OCR Reprocess] Fetch by IDs error:', error.message);
        return NextResponse.json(
          { error: `Failed to fetch photos: ${error.message}` },
          { status: 500 }
        );
      }

      photos = data || [];

    } else if (all) {
      // Fetch all legacy photos: have ocr_text but ocr_word_count is 0 or null
      // Paginate to avoid loading too many at once
      const PAGE_SIZE = 500;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabaseAdmin
          .from('activity_photos')
          .select('id, photo_url')
          .not('ocr_text', 'is', null)
          .or('ocr_word_count.is.null,ocr_word_count.eq.0')
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          console.error('[Admin OCR Reprocess] Fetch all legacy error:', error.message);
          return NextResponse.json(
            { error: `Failed to fetch legacy photos: ${error.message}` },
            { status: 500 }
          );
        }

        if (data && data.length > 0) {
          photos = photos.concat(data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
    }

    if (photos.length === 0) {
      return NextResponse.json({
        processed: 0,
        failed: 0,
        errors: [],
        message: 'No photos found to reprocess',
      });
    }

    // Process photos sequentially to avoid overloading Tesseract
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const photo of photos) {
      const errorMsg = await reprocessPhoto(photo);

      if (errorMsg) {
        failed++;
        errors.push(errorMsg);
        console.error(`[Admin OCR Reprocess] Failed: ${errorMsg}`);
      } else {
        processed++;
      }

    }

    return NextResponse.json({
      processed,
      failed,
      errors,
    });
  } catch (error: any) {
    console.error('[Admin OCR Reprocess] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Reprocessing failed' },
      { status: 500 }
    );
  }
}
