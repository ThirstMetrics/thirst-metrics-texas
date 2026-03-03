/**
 * Admin OCR Queue API Route
 * Returns photos with OCR data, filtered by review status, paginated.
 *
 * GET /api/admin/ocr/queue?status=pending&page=1&limit=20
 * Params:
 *   status - 'pending' | 'reviewed' | 'needs_review' | 'all' (default: 'pending')
 *   page   - Page number, 1-indexed (default: 1)
 *   limit  - Results per page, max 100 (default: 20)
 * Response: { photos: [...], total: number, page: number, limit: number }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse status filter
    const statusParam = searchParams.get('status') || 'pending';
    const validStatuses = ['pending', 'reviewed', 'needs_review', 'all'];
    if (!validStatuses.includes(statusParam)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Parse pagination
    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const page = Math.max(1, isNaN(pageParam) ? 1 : pageParam);

    const limitParam = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Math.min(Math.max(1, isNaN(limitParam) ? 20 : limitParam), 100);

    const offset = (page - 1) * limit;

    // Build query for photos with OCR text
    let query = supabaseAdmin
      .from('activity_photos')
      .select(
        'id, photo_url, photo_type, ocr_text, ocr_raw_text, ocr_processed_at, ocr_confidence, ocr_processing_time_ms, ocr_image_width, ocr_image_height, ocr_word_count, ocr_correction_count, ocr_review_status, uploaded_at, file_size_bytes, activity_id',
        { count: 'exact' }
      )
      .not('ocr_text', 'is', null);

    // Apply status filter
    if (statusParam !== 'all') {
      query = query.eq('ocr_review_status', statusParam);
    }

    // Order by processing date (most recent first) and paginate
    query = query
      .order('ocr_processed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[Admin OCR Queue] Query error:', error.message);
      return NextResponse.json(
        { error: `Query failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      photos: data || [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error: any) {
    console.error('[Admin OCR Queue] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch OCR queue' },
      { status: 500 }
    );
  }
}
