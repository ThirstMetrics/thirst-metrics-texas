/**
 * Saved Accounts API Route
 * GET  - Returns array of saved permit numbers for the current user
 * POST - Toggle a permit (add if not saved, remove if saved)
 */

import { NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient
      .from('user_saved_accounts')
      .select('tabc_permit_number')
      .eq('user_id', user.id);

    if (error) {
      console.error('[API] Error fetching saved accounts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch saved accounts', message: error.message },
        { status: 500 }
      );
    }

    const savedAccounts = (data || []).map((row: { tabc_permit_number: string }) => row.tabc_permit_number);
    return NextResponse.json({ savedAccounts });
  } catch (error: any) {
    console.error('[API] Error in saved accounts GET:', error);
    return NextResponse.json(
      { error: 'Failed to fetch saved accounts', message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { permitNumber } = body;

    if (!permitNumber || typeof permitNumber !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid permitNumber' },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClient();

    // Check if already saved
    const { data: existing, error: checkError } = await serviceClient
      .from('user_saved_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('tabc_permit_number', permitNumber)
      .maybeSingle();

    if (checkError) {
      console.error('[API] Error checking saved account:', checkError);
      return NextResponse.json(
        { error: 'Failed to check saved account', message: checkError.message },
        { status: 500 }
      );
    }

    if (existing) {
      // Remove (unsave)
      const { error: deleteError } = await serviceClient
        .from('user_saved_accounts')
        .delete()
        .eq('id', existing.id);

      if (deleteError) {
        console.error('[API] Error removing saved account:', deleteError);
        return NextResponse.json(
          { error: 'Failed to remove saved account', message: deleteError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ saved: false, permitNumber });
    } else {
      // Add (save)
      const { error: insertError } = await serviceClient
        .from('user_saved_accounts')
        .insert({
          user_id: user.id,
          tabc_permit_number: permitNumber,
        });

      if (insertError) {
        console.error('[API] Error saving account:', insertError);
        return NextResponse.json(
          { error: 'Failed to save account', message: insertError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({ saved: true, permitNumber });
    }
  } catch (error: any) {
    console.error('[API] Error in saved accounts POST:', error);
    return NextResponse.json(
      { error: 'Failed to toggle saved account', message: error.message },
      { status: 500 }
    );
  }
}
