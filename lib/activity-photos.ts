/**
 * Client-side activity photo upload
 * Compression, Supabase Storage upload, and activity_photos insert.
 * OCR processing is now done server-side via /api/ocr endpoint.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'activity-photos';
const MAX_SIZE_MB = 0.5;
const MAX_DIMENSION = 1920;

export type PhotoType = 'receipt' | 'menu' | 'product_display' | 'shelf' | 'other';

export interface UploadedPhoto {
  id: string;
  photo_url: string;
  file_size_bytes: number;
  photo_type: PhotoType;
  ocr_text: string | null;
  ocr_processed_at: string | null;
}

/**
 * Compress image client-side, upload to Supabase Storage, insert activity_photos row,
 * then trigger server-side OCR processing.
 */
export async function uploadActivityPhoto(
  supabase: SupabaseClient,
  activityId: string,
  file: File,
  permitNumber: string,
  photoType: PhotoType = 'other',
  options?: { maxSizeMB?: number; maxWidthOrHeight?: number }
): Promise<UploadedPhoto> {
  const maxSizeMB = options?.maxSizeMB ?? MAX_SIZE_MB;
  const maxDim = options?.maxWidthOrHeight ?? MAX_DIMENSION;

  // Compress image client-side
  let blob: Blob = file;
  try {
    const { default: imageCompression } = await import('browser-image-compression');
    blob = await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight: maxDim,
      useWebWorker: true,
    });
  } catch {
    // use original file if compression fails
  }

  // Generate unique filename
  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `${permitNumber}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const filePath = `activities/${fileName}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, blob, { cacheControl: '3600', upsert: false });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  const photoUrl = urlData.publicUrl;

  // Insert database record (without OCR text initially)
  const row = {
    activity_id: activityId,
    photo_url: photoUrl,
    file_size_bytes: blob.size,
    photo_type: photoType,
    ocr_text: null,
    ocr_processed_at: null,
  };

  const { data: insertData, error: insertError } = await supabase
    .from('activity_photos')
    .insert(row)
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to save photo record: ${insertError.message}`);
  }

  const photoId = insertData?.id;

  // Trigger server-side OCR processing (non-blocking)
  if (photoId) {
    triggerServerOCR(photoUrl, photoId).catch((err) => {
      console.error('[uploadActivityPhoto] OCR processing failed:', err);
    });
  }

  return {
    id: photoId || '',
    photo_url: photoUrl,
    file_size_bytes: blob.size,
    photo_type: photoType,
    ocr_text: null, // Will be populated by server-side OCR
    ocr_processed_at: null,
  };
}

/**
 * Trigger server-side OCR processing
 * Sends request to /api/ocr which will update the database record
 */
async function triggerServerOCR(photoUrl: string, activityPhotoId: string): Promise<void> {
  try {
    const response = await fetch('/api/ocr', {
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
      console.error('[triggerServerOCR] API error:', error);
    } else {
      const result = await response.json();
      console.log('[triggerServerOCR] OCR completed:', {
        success: result.success,
        textLength: result.correctedText?.length || 0,
        termsFound: result.beverageTerms?.length || 0,
      });
    }
  } catch (err) {
    console.error('[triggerServerOCR] Network error:', err);
    throw err;
  }
}
