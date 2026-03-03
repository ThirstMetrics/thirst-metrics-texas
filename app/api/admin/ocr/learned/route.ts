/**
 * Admin OCR Learned Dictionary API Route
 * Manage the learned dictionary entries used by the OCR pipeline.
 *
 * GET  /api/admin/ocr/learned
 *   Returns all learned dictionary entries, ordered by confirmation_count DESC.
 *
 * POST /api/admin/ocr/learned
 *   Body: { mistakeText: string, correctionText: string }
 *   Upserts a learned entry (increments confirmation_count if it exists).
 *   Invalidates the cached pipeline so it reloads on next use.
 *   Response: { entry: { ...upserted record } }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { invalidatePipeline } from '@/lib/ocr/pipeline-cache';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const dynamic = 'force-dynamic';

/** GET - List all learned dictionary entries */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('ocr_learned_dictionary')
      .select('*')
      .order('confirmation_count', { ascending: false });

    if (error) {
      console.error('[Admin OCR Learned] GET error:', error.message);
      return NextResponse.json(
        { error: `Failed to fetch learned entries: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ entries: data || [] });
  } catch (error: any) {
    console.error('[Admin OCR Learned] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch learned entries' },
      { status: 500 }
    );
  }
}

/** POST - Approve a correction into the learned dictionary */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mistakeText, correctionText } = body;

    // Validate required fields
    if (!mistakeText || typeof mistakeText !== 'string') {
      return NextResponse.json(
        { error: 'mistakeText is required and must be a string' },
        { status: 400 }
      );
    }
    if (!correctionText || typeof correctionText !== 'string') {
      return NextResponse.json(
        { error: 'correctionText is required and must be a string' },
        { status: 400 }
      );
    }

    // Normalize to lowercase for consistent matching
    const normalizedMistake = mistakeText.trim().toLowerCase();
    const normalizedCorrection = correctionText.trim();

    // Check if this entry already exists
    const { data: existing } = await supabaseAdmin
      .from('ocr_learned_dictionary')
      .select('id, confirmation_count')
      .eq('mistake_text', normalizedMistake)
      .eq('correction_text', normalizedCorrection)
      .single();

    let entry;

    if (existing) {
      // Increment confirmation count
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('ocr_learned_dictionary')
        .update({
          confirmation_count: existing.confirmation_count + 1,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        console.error('[Admin OCR Learned] Update error:', updateError.message);
        return NextResponse.json(
          { error: `Failed to update entry: ${updateError.message}` },
          { status: 500 }
        );
      }

      entry = updated;
    } else {
      // Insert new entry
      const { data: created, error: insertError } = await supabaseAdmin
        .from('ocr_learned_dictionary')
        .insert({
          mistake_text: normalizedMistake,
          correction_text: normalizedCorrection,
          confirmation_count: 1,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) {
        console.error('[Admin OCR Learned] Insert error:', insertError.message);
        return NextResponse.json(
          { error: `Failed to create entry: ${insertError.message}` },
          { status: 500 }
        );
      }

      entry = created;
    }

    // Invalidate the cached pipeline so it reloads with the new entry
    invalidatePipeline();

    return NextResponse.json({ entry });
  } catch (error: any) {
    console.error('[Admin OCR Learned] POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save learned entry' },
      { status: 500 }
    );
  }
}
