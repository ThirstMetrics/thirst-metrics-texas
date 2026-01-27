/**
 * Client-side activity photo upload
 * Compression, Supabase Storage upload, OCR, and activity_photos insert.
 * Use from browser only (uses createWorker from tesseract.js).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'activity-photos';
const MAX_SIZE_MB = 0.5;
const MAX_DIMENSION = 1920;

export type PhotoType = 'receipt' | 'menu' | 'product_display' | 'shelf' | 'other';

export interface UploadedPhoto {
  photo_url: string;
  file_size_bytes: number;
  photo_type: PhotoType;
  ocr_text: string | null;
  ocr_processed_at: string | null;
}

/**
 * Compress image client-side, upload to Supabase Storage, run OCR, insert activity_photos row.
 * Uses browser-image-compression and tesseract.js — must run in browser.
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

  let blob = file;
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

  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `${permitNumber}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const filePath = `activities/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, blob, { cacheControl: '3600', upsert: false });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  const photoUrl = urlData.publicUrl;

  let ocrText: string | null = null;
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    const { data } = await worker.recognize(blob);
    ocrText = data.text?.trim() || null;
    await worker.terminate();
  } catch {
    // non-fatal
  }

  const row = {
    activity_id: activityId,
    photo_url: photoUrl,
    file_size_bytes: blob.size,
    photo_type: photoType,
    ocr_text: ocrText,
    ocr_processed_at: ocrText ? new Date().toISOString() : null,
  };

  const { error: insertError } = await supabase.from('activity_photos').insert(row);
  if (insertError) {
    throw new Error(`Failed to save photo record: ${insertError.message}`);
  }

  return {
    photo_url: photoUrl,
    file_size_bytes: blob.size,
    photo_type: photoType,
    ocr_text: ocrText,
    ocr_processed_at: row.ocr_processed_at,
  };
}
