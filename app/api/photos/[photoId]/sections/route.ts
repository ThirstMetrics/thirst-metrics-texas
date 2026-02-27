/**
 * Menu Section Bounding Boxes API Route
 * CRUD operations for managing OCR menu section annotations on photos.
 *
 * GET    /api/photos/[photoId]/sections       — list all sections for a photo
 * POST   /api/photos/[photoId]/sections       — create a new section
 * PUT    /api/photos/[photoId]/sections       — update an existing section
 * DELETE /api/photos/[photoId]/sections       — delete a section
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';

const VALID_SECTION_TYPES = [
  'cocktails',
  'wines_by_glass',
  'draft_beers',
  'bottled_beers',
  'spirits_list',
  'wine_list',
  'sake_by_glass',
  'sake_by_bottle',
  'food',
  'other',
] as const;

type SectionType = (typeof VALID_SECTION_TYPES)[number];

function isValidSectionType(value: string): value is SectionType {
  return VALID_SECTION_TYPES.includes(value as SectionType);
}

/**
 * GET /api/photos/[photoId]/sections
 * Returns all menu sections for a given photo.
 */
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

    // Verify the photo exists
    const { data: photo, error: photoError } = await supabaseAdmin
      .from('activity_photos')
      .select('id')
      .eq('id', photoId)
      .single();

    if (photoError || !photo) {
      return NextResponse.json(
        { error: 'Photo not found' },
        { status: 404 }
      );
    }

    // Fetch all sections for this photo
    const { data: sections, error: sectionsError } = await supabaseAdmin
      .from('ocr_menu_sections')
      .select('*')
      .eq('activity_photo_id', photoId)
      .order('created_at', { ascending: true });

    if (sectionsError) {
      console.error('[Sections API] GET query error:', sectionsError.message);
      return NextResponse.json(
        { error: `Failed to fetch sections: ${sectionsError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ sections: sections || [] });
  } catch (error: any) {
    console.error('[Sections API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sections' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/photos/[photoId]/sections
 * Create a new menu section bounding box.
 * Body: { section_type, bbox_x0, bbox_y0, bbox_x1, bbox_y1, label? }
 */
export async function POST(
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
    const { section_type, bbox_x0, bbox_y0, bbox_x1, bbox_y1, label } = body;

    // Validate required fields
    if (!section_type) {
      return NextResponse.json(
        { error: 'section_type is required' },
        { status: 400 }
      );
    }

    if (!isValidSectionType(section_type)) {
      return NextResponse.json(
        { error: `Invalid section_type. Must be one of: ${VALID_SECTION_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (bbox_x0 == null || bbox_y0 == null || bbox_x1 == null || bbox_y1 == null) {
      return NextResponse.json(
        { error: 'bbox_x0, bbox_y0, bbox_x1, and bbox_y1 are all required' },
        { status: 400 }
      );
    }

    if (
      typeof bbox_x0 !== 'number' ||
      typeof bbox_y0 !== 'number' ||
      typeof bbox_x1 !== 'number' ||
      typeof bbox_y1 !== 'number'
    ) {
      return NextResponse.json(
        { error: 'Bounding box coordinates must be numbers' },
        { status: 400 }
      );
    }

    // Verify the photo exists
    const { data: photo, error: photoError } = await supabaseAdmin
      .from('activity_photos')
      .select('id')
      .eq('id', photoId)
      .single();

    if (photoError || !photo) {
      return NextResponse.json(
        { error: 'Photo not found' },
        { status: 404 }
      );
    }

    // Insert the new section
    const insertData: Record<string, any> = {
      activity_photo_id: photoId,
      section_type,
      bbox_x0,
      bbox_y0,
      bbox_x1,
      bbox_y1,
    };

    if (label !== undefined && label !== null) {
      insertData.label = label;
    }

    const { data: section, error: insertError } = await supabaseAdmin
      .from('ocr_menu_sections')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('[Sections API] POST insert error:', insertError.message);
      return NextResponse.json(
        { error: `Failed to create section: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ section }, { status: 201 });
  } catch (error: any) {
    console.error('[Sections API] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create section' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/photos/[photoId]/sections
 * Update an existing menu section bounding box.
 * Body: { id, section_type?, bbox_x0?, bbox_y0?, bbox_x1?, bbox_y1?, label? }
 */
export async function PUT(
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
    const { id, section_type, bbox_x0, bbox_y0, bbox_x1, bbox_y1, label } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required to identify the section to update' },
        { status: 400 }
      );
    }

    // Validate section_type if provided
    if (section_type !== undefined && !isValidSectionType(section_type)) {
      return NextResponse.json(
        { error: `Invalid section_type. Must be one of: ${VALID_SECTION_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate bbox fields if provided (must be numbers)
    const bboxFields = { bbox_x0, bbox_y0, bbox_x1, bbox_y1 };
    for (const [key, value] of Object.entries(bboxFields)) {
      if (value !== undefined && typeof value !== 'number') {
        return NextResponse.json(
          { error: `${key} must be a number` },
          { status: 400 }
        );
      }
    }

    // Build update payload with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (section_type !== undefined) updateData.section_type = section_type;
    if (bbox_x0 !== undefined) updateData.bbox_x0 = bbox_x0;
    if (bbox_y0 !== undefined) updateData.bbox_y0 = bbox_y0;
    if (bbox_x1 !== undefined) updateData.bbox_x1 = bbox_x1;
    if (bbox_y1 !== undefined) updateData.bbox_y1 = bbox_y1;
    if (label !== undefined) updateData.label = label;

    // Update the section, scoped to this photo
    const { data: section, error: updateError } = await supabaseAdmin
      .from('ocr_menu_sections')
      .update(updateData)
      .eq('id', id)
      .eq('activity_photo_id', photoId)
      .select()
      .single();

    if (updateError) {
      console.error('[Sections API] PUT update error:', updateError.message);
      // Distinguish between not-found and other errors
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Section not found for this photo' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Failed to update section: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ section });
  } catch (error: any) {
    console.error('[Sections API] PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update section' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/photos/[photoId]/sections
 * Delete a menu section bounding box.
 * Body: { id }
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
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'id is required to identify the section to delete' },
        { status: 400 }
      );
    }

    // Delete the section, scoped to this photo for safety
    const { error: deleteError, count } = await supabaseAdmin
      .from('ocr_menu_sections')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('activity_photo_id', photoId);

    if (deleteError) {
      console.error('[Sections API] DELETE error:', deleteError.message);
      return NextResponse.json(
        { error: `Failed to delete section: ${deleteError.message}` },
        { status: 500 }
      );
    }

    if (count === 0) {
      return NextResponse.json(
        { error: 'Section not found for this photo' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Sections API] DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete section' },
      { status: 500 }
    );
  }
}
