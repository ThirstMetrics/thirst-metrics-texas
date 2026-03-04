/**
 * Menu Items API Route
 * GET /api/admin/ocr/sections/[sectionId]/items — list parsed items for a section
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
  { params }: { params: { sectionId: string } }
) {
  try {
    const { sectionId } = params;

    if (!sectionId) {
      return NextResponse.json(
        { error: 'sectionId is required' },
        { status: 400 }
      );
    }

    // Verify section exists
    const { data: section, error: sectionError } = await supabaseAdmin
      .from('ocr_menu_sections')
      .select('id')
      .eq('id', sectionId)
      .single();

    if (sectionError || !section) {
      return NextResponse.json(
        { error: 'Section not found' },
        { status: 404 }
      );
    }

    // Fetch items ordered by sort_order
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('menu_items')
      .select('*')
      .eq('section_id', sectionId)
      .order('sort_order', { ascending: true });

    if (itemsError) {
      console.error('[Items API] GET error:', itemsError.message);
      return NextResponse.json(
        { error: `Failed to fetch items: ${itemsError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ items: items || [] });
  } catch (error: any) {
    console.error('[Items API] GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch items' },
      { status: 500 }
    );
  }
}
