/**
 * Admin OCR Word Data API Route
 * Returns word-level OCR data for a specific photo, including bounding boxes.
 *
 * GET    /api/admin/ocr/words/[photoId]
 * DELETE /api/admin/ocr/words/[photoId]  — delete words by index, save as training data
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

/**
 * DELETE /api/admin/ocr/words/[photoId]
 * Delete specific words by their indices. Saves deletions as training data
 * in ocr_user_corrections with user_text '[DELETED]'.
 * Body: { wordIndices: number[] }
 */
export async function DELETE(
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

    const body = await request.json();
    const { wordIndices } = body;

    if (!Array.isArray(wordIndices) || wordIndices.length === 0) {
      return NextResponse.json(
        { error: 'wordIndices must be a non-empty array of numbers' },
        { status: 400 }
      );
    }

    // Fetch the words to be deleted (need their data for training records)
    const { data: wordsToDelete, error: fetchError } = await supabaseAdmin
      .from('ocr_word_data')
      .select('*')
      .eq('activity_photo_id', photoId)
      .in('word_index', wordIndices);

    if (fetchError) {
      console.error('[Admin OCR Words] Fetch for delete error:', fetchError.message);
      return NextResponse.json(
        { error: `Failed to fetch words: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!wordsToDelete || wordsToDelete.length === 0) {
      return NextResponse.json(
        { error: 'No matching words found' },
        { status: 404 }
      );
    }

    // Insert training data records for each deleted word
    const correctionRecords = wordsToDelete.map((w: any) => ({
      activity_photo_id: photoId,
      word_index: w.word_index,
      system_text: w.corrected_text || w.raw_text,
      user_text: '[DELETED]',
      status: 'pending',
      bbox_x0: w.bbox_x0,
      bbox_y0: w.bbox_y0,
      bbox_x1: w.bbox_x1,
      bbox_y1: w.bbox_y1,
    }));

    const { error: correctionError } = await supabaseAdmin
      .from('ocr_user_corrections')
      .insert(correctionRecords);

    if (correctionError) {
      console.error('[Admin OCR Words] Correction insert error:', correctionError.message);
      // Continue with deletion even if correction logging fails
    }

    // Delete the words
    const { error: deleteError, count } = await supabaseAdmin
      .from('ocr_word_data')
      .delete({ count: 'exact' })
      .eq('activity_photo_id', photoId)
      .in('word_index', wordIndices);

    if (deleteError) {
      console.error('[Admin OCR Words] Delete error:', deleteError.message);
      return NextResponse.json(
        { error: `Failed to delete words: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // Update word count on activity_photos
    const { count: remainingCount } = await supabaseAdmin
      .from('ocr_word_data')
      .select('*', { count: 'exact', head: true })
      .eq('activity_photo_id', photoId);

    await supabaseAdmin
      .from('activity_photos')
      .update({ ocr_word_count: remainingCount ?? 0 })
      .eq('id', photoId);

    return NextResponse.json({ deleted: count ?? 0 });
  } catch (error: any) {
    console.error('[Admin OCR Words] DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete words' },
      { status: 500 }
    );
  }
}
