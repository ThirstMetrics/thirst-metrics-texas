/**
 * Activities API Route
 * Handles CRUD operations for sales activities
 */

import { NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { createActivity } from '@/lib/data/activities';

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const activityData = await request.json();
    
    // Ensure user_id matches authenticated user
    activityData.user_id = user.id;
    
    const activity = await createActivity(activityData);
    
    return NextResponse.json({ activity });
  } catch (error: any) {
    console.error('Error creating activity:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create activity' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Use service client for data fetching to bypass RLS on activity_photos
    const serviceClient = createServiceClient();

    const { searchParams } = new URL(request.url);
    const permitNumber = searchParams.get('permitNumber');

    if (permitNumber) {
      const { data, error } = await serviceClient
        .from('sales_activities')
        .select('*, activity_photos(*)')
        .eq('tabc_permit_number', permitNumber)
        .order('activity_date', { ascending: false });

      if (error) throw error;
      return NextResponse.json({ activities: data });
    }

    // Get user's activities
    const { data, error } = await serviceClient
      .from('sales_activities')
      .select('*, activity_photos(*)')
      .eq('user_id', user.id)
      .order('activity_date', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ activities: data });
  } catch (error: any) {
    console.error('Error fetching activities:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch activities' },
      { status: 500 }
    );
  }
}
