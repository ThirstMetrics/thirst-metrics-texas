/**
 * Photos API Route
 * Server-side photo upload with service role client to bypass RLS
 *
 * POST /api/photos
 * FormData: { file, activityId, permitNumber, photoType }
 * Returns: { photo: UploadedPhoto }
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

const BUCKET = 'activity-photos';

export async function POST(request: Request) {
  try {
    // Use service role client to bypass RLS (safe because we validate inputs)
    const supabase = createServiceClient();

    // Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const activityId = formData.get('activityId') as string | null;
    const permitNumber = formData.get('permitNumber') as string | null;
    const photoType = formData.get('photoType') as string || 'other';

    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }
    if (!activityId) {
      return NextResponse.json({ error: 'activityId is required' }, { status: 400 });
    }
    if (!permitNumber) {
      return NextResponse.json({ error: 'permitNumber is required' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'jpg';
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 9);
    const fileName = `${permitNumber}_${timestamp}_${random}.${ext}`;
    const filePath = `activities/${fileName}`;

    console.log('[Photos API] Uploading:', { filePath, size: file.size, type: file.type });

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage (service role bypasses storage RLS)
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[Photos API] Storage upload error:', uploadError);
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    const photoUrl = urlData.publicUrl;

    console.log('[Photos API] Photo URL:', photoUrl);

    // Insert database record (service role bypasses RLS)
    const { data: photoData, error: insertError } = await supabase
      .from('activity_photos')
      .insert({
        activity_id: activityId,
        photo_url: photoUrl,
        file_size_bytes: file.size,
        photo_type: photoType,
        ocr_text: null,
        ocr_processed_at: null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Photos API] Database insert error:', insertError);
      // Try to clean up the uploaded file
      await supabase.storage.from(BUCKET).remove([filePath]);
      return NextResponse.json(
        { error: `Database insert failed: ${insertError.message}` },
        { status: 500 }
      );
    }

    console.log('[Photos API] Photo record created:', photoData.id);

    // Trigger server-side OCR processing (non-blocking)
    if (photoData.id) {
      triggerOCR(photoUrl, photoData.id).catch((err) => {
        console.error('[Photos API] OCR trigger failed:', err);
      });
    }

    return NextResponse.json({
      photo: {
        id: photoData.id,
        photo_url: photoUrl,
        file_size_bytes: file.size,
        photo_type: photoType,
        ocr_text: null,
        ocr_processed_at: null,
      },
    });
  } catch (error: any) {
    console.error('[Photos API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Photo upload failed' },
      { status: 500 }
    );
  }
}

/**
 * Trigger server-side OCR processing
 * Non-blocking - fires and forgets
 */
async function triggerOCR(photoUrl: string, activityPhotoId: string): Promise<void> {
  try {
    // Use internal API call (same server)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/ocr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        photoUrl,
        activityPhotoId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[Photos API] OCR API error:', error);
    } else {
      const result = await response.json();
      console.log('[Photos API] OCR completed:', {
        success: result.success,
        textLength: result.correctedText?.length || 0,
        termsFound: result.beverageTerms?.length || 0,
      });
    }
  } catch (err) {
    console.error('[Photos API] OCR network error:', err);
  }
}
