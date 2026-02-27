/**
 * OCR API Route (Enhanced)
 * Server-side OCR processing using the @thirst-metrics/ocr-engine pipeline
 * with word-level data storage and learned dictionary support.
 *
 * POST /api/ocr
 * Body: { photoUrl: string, activityPhotoId?: string }
 * Response: Full pipeline result with word data, corrections, and metadata
 *
 * GET /api/ocr?photoUrl=...
 * Quick OCR without database update (backward compatibility)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { OCRPipeline } from '@thirst-metrics/ocr-engine';
import type { LearnedDictionaryEntry, OCRWord } from '@thirst-metrics/ocr-engine';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** Singleton pipeline instance, lazy-initialized with learned entries from DB */
let pipeline: OCRPipeline | null = null;

/**
 * Get or create the singleton OCR pipeline.
 * Loads learned dictionary entries from the ocr_learned_dictionary table on first call.
 */
async function getPipeline(): Promise<OCRPipeline> {
  if (pipeline) return pipeline;

  // Load learned entries from Supabase
  const { data: learnedRows } = await supabaseAdmin
    .from('ocr_learned_dictionary')
    .select('mistake_text, correction_text, confirmation_count, is_active')
    .eq('is_active', true);

  const learnedEntries: LearnedDictionaryEntry[] = (learnedRows || []).map(row => ({
    mistakeText: row.mistake_text,
    correctionText: row.correction_text,
    confirmationCount: row.confirmation_count,
    isActive: row.is_active,
  }));

  pipeline = new OCRPipeline({ learnedEntries });
  return pipeline;
}

/**
 * Invalidate the cached pipeline so it reloads learned entries on next use.
 * Called externally when the learned dictionary is updated.
 */
export function invalidatePipeline(): void {
  pipeline = null;
}

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
      console.error(`[OCR API] storeWordData batch ${i}-${i + batch.length} error:`, error.message);
    }
  }
}

/**
 * POST /api/ocr
 * Full pipeline with DB storage of word data and enhanced metadata.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { photoUrl, activityPhotoId } = body;

    if (!photoUrl) {
      return NextResponse.json(
        { error: 'photoUrl is required' },
        { status: 400 }
      );
    }

    // Run OCR through the enhanced pipeline
    const ocr = await getPipeline();
    const result = await ocr.processUrl(photoUrl);

    // If activityPhotoId provided, persist results to the database
    if (activityPhotoId && result.success) {
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
        .eq('id', activityPhotoId);

      if (updateError) {
        console.error('[OCR API] activity_photos update error:', updateError.message);
        // Don't fail the request - OCR still succeeded
      }

      // Store word-level data
      if (result.words.length > 0) {
        await storeWordData(activityPhotoId, result.words);
      }
    }

    // Return full result with backward-compatible fields
    return NextResponse.json({
      success: result.success,
      rawText: result.rawText,
      correctedText: result.correctedText,
      beverageTerms: result.beverageTerms,
      confidence: result.confidence,
      processingTimeMs: result.processingTimeMs,
      // Enhanced fields
      wordCount: result.words.length,
      correctionCount: result.corrections.length,
      imageDimensions: result.imageDimensions,
      corrections: result.corrections,
      error: result.error,
    });
  } catch (error: any) {
    console.error('[OCR API] POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'OCR processing failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ocr?photoUrl=...
 * Quick OCR without database update (backward compatibility).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const photoUrl = searchParams.get('photoUrl');

    if (!photoUrl) {
      return NextResponse.json(
        { error: 'photoUrl query parameter is required' },
        { status: 400 }
      );
    }

    const ocr = await getPipeline();
    const result = await ocr.processUrl(photoUrl);

    return NextResponse.json({
      success: result.success,
      rawText: result.rawText,
      correctedText: result.correctedText,
      beverageTerms: result.beverageTerms,
      confidence: result.confidence,
      processingTimeMs: result.processingTimeMs,
      error: result.error,
    });
  } catch (error: any) {
    console.error('[OCR API] GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'OCR processing failed',
      },
      { status: 500 }
    );
  }
}
