/**
 * Admin OCR Corrections API Route
 * Submit user corrections for OCR words, updating both the correction record
 * and the word data itself.
 *
 * POST /api/admin/ocr/corrections
 * Body: { activityPhotoId: string, wordIndex: number, systemText: string, userText: string, bbox?: object }
 * Response: { correction: { ...created record } }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { activityPhotoId, wordIndex, systemText, userText, bbox } = body;

    // Validate required fields
    if (!activityPhotoId || typeof activityPhotoId !== 'string') {
      return NextResponse.json(
        { error: 'activityPhotoId is required and must be a string' },
        { status: 400 }
      );
    }
    if (wordIndex === undefined || wordIndex === null || typeof wordIndex !== 'number') {
      return NextResponse.json(
        { error: 'wordIndex is required and must be a number' },
        { status: 400 }
      );
    }
    if (!systemText || typeof systemText !== 'string') {
      return NextResponse.json(
        { error: 'systemText is required' },
        { status: 400 }
      );
    }
    if (!userText || typeof userText !== 'string') {
      return NextResponse.json(
        { error: 'userText is required' },
        { status: 400 }
      );
    }

    // Build the correction record
    const correctionRecord: Record<string, any> = {
      activity_photo_id: activityPhotoId,
      word_index: wordIndex,
      system_text: systemText,
      user_text: userText,
    };

    // Include bounding box if provided
    if (bbox) {
      correctionRecord.bbox_x0 = bbox.x0;
      correctionRecord.bbox_y0 = bbox.y0;
      correctionRecord.bbox_x1 = bbox.x1;
      correctionRecord.bbox_y1 = bbox.y1;
    }

    // Insert the correction into ocr_user_corrections
    const { data: correction, error: insertError } = await supabaseAdmin
      .from('ocr_user_corrections')
      .insert(correctionRecord)
      .select()
      .single();

    if (insertError) {
      console.error('[Admin OCR Corrections] Insert error:', insertError.message);
      return NextResponse.json(
        { error: `Failed to save correction: ${insertError.message}` },
        { status: 500 }
      );
    }

    // Update the corresponding word data with the user's correction
    const { error: updateError } = await supabaseAdmin
      .from('ocr_word_data')
      .update({
        corrected_text: userText,
        was_corrected: true,
        correction_source: 'user',
      })
      .eq('activity_photo_id', activityPhotoId)
      .eq('word_index', wordIndex);

    if (updateError) {
      console.error('[Admin OCR Corrections] Word update error:', updateError.message);
      // Don't fail - the correction record was saved successfully
    }

    return NextResponse.json({ correction });
  } catch (error: any) {
    console.error('[Admin OCR Corrections] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit correction' },
      { status: 500 }
    );
  }
}
