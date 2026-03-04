/**
 * Single Menu Item API Route
 * PUT    /api/admin/ocr/sections/[sectionId]/items/[itemId] — update a parsed item
 * DELETE /api/admin/ocr/sections/[sectionId]/items/[itemId] — delete a parsed item
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';

const VALID_ITEM_TYPES = ['header_1', 'header_2', 'header_3', 'line_item'] as const;
const VALID_MATCH_STATUSES = ['unmatched', 'auto_matched', 'user_confirmed', 'user_rejected'] as const;

/**
 * PUT — Update a parsed menu item (inline edit).
 * Body: partial fields to update.
 */
export async function PUT(
  request: Request,
  { params }: { params: { sectionId: string; itemId: string } }
) {
  try {
    const { sectionId, itemId } = params;

    if (!sectionId || !itemId) {
      return NextResponse.json(
        { error: 'sectionId and itemId are required' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Build update payload with only provided fields
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Validate item_type if provided
    if (body.item_type !== undefined) {
      if (!VALID_ITEM_TYPES.includes(body.item_type)) {
        return NextResponse.json(
          { error: `Invalid item_type. Must be one of: ${VALID_ITEM_TYPES.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.item_type = body.item_type;
    }

    // Validate match_status if provided
    if (body.match_status !== undefined) {
      if (!VALID_MATCH_STATUSES.includes(body.match_status)) {
        return NextResponse.json(
          { error: `Invalid match_status. Must be one of: ${VALID_MATCH_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.match_status = body.match_status;
    }

    // Copy allowed fields
    const allowedFields = [
      'sort_order', 'raw_text', 'bin_number', 'item_name', 'producer',
      'varietal', 'appellation', 'vintage', 'format', 'price', 'price_text',
      'notes', 'product_id', 'match_confidence', 'parent_header_id',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Update the item, scoped to this section
    const { data: item, error: updateError } = await supabaseAdmin
      .from('menu_items')
      .update(updateData)
      .eq('id', itemId)
      .eq('section_id', sectionId)
      .select()
      .single();

    if (updateError) {
      console.error('[Items API] PUT error:', updateError.message);
      if (updateError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Item not found for this section' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Failed to update item: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ item });
  } catch (error: any) {
    console.error('[Items API] PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update item' },
      { status: 500 }
    );
  }
}

/**
 * DELETE — Remove a parsed menu item.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { sectionId: string; itemId: string } }
) {
  try {
    const { sectionId, itemId } = params;

    if (!sectionId || !itemId) {
      return NextResponse.json(
        { error: 'sectionId and itemId are required' },
        { status: 400 }
      );
    }

    const { error: deleteError, count } = await supabaseAdmin
      .from('menu_items')
      .delete({ count: 'exact' })
      .eq('id', itemId)
      .eq('section_id', sectionId);

    if (deleteError) {
      console.error('[Items API] DELETE error:', deleteError.message);
      return NextResponse.json(
        { error: `Failed to delete item: ${deleteError.message}` },
        { status: 500 }
      );
    }

    if (count === 0) {
      return NextResponse.json(
        { error: 'Item not found for this section' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Items API] DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete item' },
      { status: 500 }
    );
  }
}
