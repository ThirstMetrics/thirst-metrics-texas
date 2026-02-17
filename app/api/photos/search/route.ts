/**
 * Photo OCR Search API Route
 * Full-text search across OCR-extracted text from activity photos
 *
 * GET /api/photos/search?q=<term>&limit=50&offset=0&photoType=receipt
 */

import { NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Authenticate the user
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Parse and validate query param
    const rawQuery = searchParams.get('q');
    if (!rawQuery || rawQuery.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing required query parameter: q' },
        { status: 400 }
      );
    }

    // Sanitize: trim whitespace and cap at 200 characters
    const query = rawQuery.trim().slice(0, 200);

    // Parse pagination params
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Math.min(Math.max(1, isNaN(limitParam) ? 50 : limitParam), 100);

    const offsetParam = parseInt(searchParams.get('offset') || '0', 10);
    const offset = Math.max(0, isNaN(offsetParam) ? 0 : offsetParam);

    // Optional photo type filter
    const photoType = searchParams.get('photoType');

    // Use service client to bypass RLS for data queries
    const serviceClient = createServiceClient();

    // Build the search query with joined activity data
    let searchQuery = serviceClient
      .from('activity_photos')
      .select(
        '*, sales_activities!inner(id, tabc_permit_number, activity_type, activity_date, contact_name)',
        { count: 'exact' }
      )
      .ilike('ocr_text', `%${query}%`)
      .order('uploaded_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (photoType) {
      searchQuery = searchQuery.eq('photo_type', photoType);
    }

    const { data, error, count } = await searchQuery;

    if (error) {
      console.error('[Photos Search API] Query error:', error);
      return NextResponse.json(
        { error: `Search query failed: ${error.message}` },
        { status: 500 }
      );
    }

    // Fetch stats: total photos and photos with OCR text
    const [totalResult, ocrResult] = await Promise.all([
      serviceClient
        .from('activity_photos')
        .select('id', { count: 'exact', head: true }),
      serviceClient
        .from('activity_photos')
        .select('id', { count: 'exact', head: true })
        .not('ocr_text', 'is', null),
    ]);

    const totalPhotos = totalResult.count ?? 0;
    const photosWithOcr = ocrResult.count ?? 0;

    // Shape the response
    const results = (data || []).map((photo: any) => ({
      id: photo.id,
      photo_url: photo.photo_url,
      photo_type: photo.photo_type,
      ocr_text: photo.ocr_text,
      ocr_processed_at: photo.ocr_processed_at,
      uploaded_at: photo.uploaded_at,
      file_size_bytes: photo.file_size_bytes,
      activity: {
        id: photo.sales_activities.id,
        tabc_permit_number: photo.sales_activities.tabc_permit_number,
        activity_type: photo.sales_activities.activity_type,
        activity_date: photo.sales_activities.activity_date,
        contact_name: photo.sales_activities.contact_name,
      },
    }));

    return NextResponse.json({
      results,
      total: count ?? 0,
      stats: {
        totalPhotos,
        photosWithOcr,
      },
    });
  } catch (error: any) {
    console.error('[Photos Search API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Photo search failed' },
      { status: 500 }
    );
  }
}
