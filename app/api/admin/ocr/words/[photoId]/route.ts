/**
 * Admin OCR Word Data API Route
 * Returns word-level OCR data for a specific photo, including bounding boxes.
 *
 * GET /api/admin/ocr/words/[photoId]
 * Response: { words: OCRWord[], photo: { id, photo_url, ocr_image_width, ocr_image_height } }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { photoId: string } }
) {
  try {
    const { photoId } = params;

    if (!photoId) {
      return NextResponse.json(
        { error: 'photoId is required' },
        { status: 400 }
      );
    }

    // Fetch photo metadata
    const { data: photo, error: photoError } = await supabaseAdmin
      .from('activity_photos')
      .select('id, photo_url, ocr_image_width, ocr_image_height, ocr_confidence, ocr_review_status')
      .eq('id', photoId)
      .single();

    if (photoError || !photo) {
      return NextResponse.json(
        { error: 'Photo not found' },
        { status: 404 }
      );
    }

    // Fetch word-level data ordered by word_index
    const { data: words, error: wordsError } = await supabaseAdmin
      .from('ocr_word_data')
      .select('*')
      .eq('activity_photo_id', photoId)
      .order('word_index', { ascending: true });

    if (wordsError) {
      console.error('[Admin OCR Words] Query error:', wordsError.message);
      return NextResponse.json(
        { error: `Failed to fetch word data: ${wordsError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      words: words || [],
      photo: {
        id: photo.id,
        photo_url: photo.photo_url,
        ocr_image_width: photo.ocr_image_width,
        ocr_image_height: photo.ocr_image_height,
        ocr_confidence: photo.ocr_confidence,
        ocr_review_status: photo.ocr_review_status,
      },
    });
  } catch (error: any) {
    console.error('[Admin OCR Words] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch word data' },
      { status: 500 }
    );
  }
}
