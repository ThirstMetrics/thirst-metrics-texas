/**
 * OCR API Route
 * Server-side OCR processing with beverage dictionary corrections
 *
 * POST /api/ocr
 * Body: { photoUrl: string, activityPhotoId?: string }
 * Response: { success: boolean, rawText: string, correctedText: string, ... }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processImageOCR } from '@/lib/ocr/tesseract-server';

// Server-side Supabase client with service role for database updates
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

    console.log('[OCR API] Processing image:', photoUrl);

    // Run OCR with beverage dictionary corrections
    const result = await processImageOCR(photoUrl);

    console.log('[OCR API] Result:', {
      success: result.success,
      textLength: result.correctedText.length,
      termsFound: result.beverageTerms.length,
      confidence: result.confidence,
      timeMs: result.processingTimeMs,
    });

    // If activityPhotoId provided, update the database record
    if (activityPhotoId && result.success) {
      const { error: updateError } = await supabaseAdmin
        .from('activity_photos')
        .update({
          ocr_text: result.correctedText,
          ocr_processed_at: new Date().toISOString(),
          ocr_language: 'en',
        })
        .eq('id', activityPhotoId);

      if (updateError) {
        console.error('[OCR API] Database update error:', updateError);
        // Don't fail the request, OCR still succeeded
      } else {
        console.log('[OCR API] Database record updated:', activityPhotoId);
      }
    }

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
    console.error('[OCR API] Error:', error);
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
 * Quick OCR without database update
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

    const result = await processImageOCR(photoUrl);

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
    console.error('[OCR API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'OCR processing failed',
      },
      { status: 500 }
    );
  }
}
