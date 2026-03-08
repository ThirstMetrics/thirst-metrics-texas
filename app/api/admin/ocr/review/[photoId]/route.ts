/**
 * Admin OCR Review API Route
 * Update the review status of an OCR-processed photo.
 *
 * PATCH /api/admin/ocr/review/[photoId]
 * Body: { status: 'reviewed' | 'needs_review' }
 * Response: { success: true, photoId: string, status: string }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const VALID_STATUSES = ['reviewed', 'needs_review'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ photoId: string }> }
) {
  try {
    const { photoId } = await params;

    if (!photoId) {
      return NextResponse.json(
        { error: 'photoId is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status } = body;

    // Validate status value
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify the photo exists
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('activity_photos')
      .select('id')
      .eq('id', photoId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Photo not found' },
        { status: 404 }
      );
    }

    // Update the review status
    const { error: updateError } = await supabaseAdmin
      .from('activity_photos')
      .update({ ocr_review_status: status })
      .eq('id', photoId);

    if (updateError) {
      console.error('[Admin OCR Review] Update error:', updateError.message);
      return NextResponse.json(
        { error: `Failed to update review status: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      photoId,
      status,
    });
  } catch (error: any) {
    console.error('[Admin OCR Review] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update review status' },
      { status: 500 }
    );
  }
}
