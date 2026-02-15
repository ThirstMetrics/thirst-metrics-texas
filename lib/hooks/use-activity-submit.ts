/**
 * Shared Activity Submission Hook
 * Encapsulates GPS capture, activity creation, and photo upload logic.
 * Used by both the full ActivityForm and the mobile MapActivitySheet.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import imageCompression from 'browser-image-compression';

// Photo type for upload
export type PhotoType = 'receipt' | 'menu' | 'product_display' | 'shelf' | 'other';

// Pending photo before upload
export interface PendingPhoto {
  file: File;
  type: PhotoType;
  preview?: string;
}

// GPS location state
export interface GpsLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

// Activity form data (subset of fields needed for submission)
export interface ActivityFormData {
  activity_type: 'visit' | 'call' | 'email' | 'note';
  activity_date: string;
  notes?: string | null;
  outcome?: 'positive' | 'neutral' | 'negative' | 'no_contact' | '' | null;
  next_followup_date?: string | null;
  contact_name?: string | null;
  contact_cell_phone?: string | null;
  contact_email?: string | null;
  contact_preferred_method?: 'text' | 'call' | 'email' | 'in_person' | '' | null;
  decision_maker?: boolean;
  conversation_summary?: string | null;
  product_interest?: string[];
  current_products_carried?: string | null;
  objections?: string | null;
  competitors_mentioned?: string[];
  next_action?: string | null;
  // Availability fields (optional, used by full form)
  availability?: Record<string, boolean>;
}

interface UseActivitySubmitOptions {
  permitNumber: string;
  userId: string;
  onSuccess?: () => void;
  autoGps?: boolean;
}

export interface UseActivitySubmitReturn {
  submitActivity: (formData: ActivityFormData, photos?: PendingPhoto[]) => Promise<void>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  photoUploadProgress: string | null;
  gpsLocation: GpsLocation | null;
  gpsError: string | null;
  captureGps: () => void;
}

const MAX_PHOTOS = 5;

/**
 * Compress a photo file for upload
 */
export async function compressPhoto(file: File): Promise<File> {
  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/jpeg',
    });
    return new File(
      [compressed],
      file.name.replace(/\.[^.]+$/, '.jpg'),
      { type: 'image/jpeg', lastModified: Date.now() }
    );
  } catch {
    // If compression fails, return original
    return file;
  }
}

/**
 * Hook for submitting activities with GPS capture and photo uploads
 */
export function useActivitySubmit({
  permitNumber,
  userId,
  onSuccess,
  autoGps = true,
}: UseActivitySubmitOptions): UseActivitySubmitReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<string | null>(null);
  const [gpsLocation, setGpsLocation] = useState<GpsLocation | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Capture GPS location
  const captureGps = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation not supported');
      return;
    }

    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy || 0,
        });
        setGpsError(null);
      },
      (err) => {
        setGpsError(`GPS error: ${err.message}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 60000,
      }
    );
  }, []);

  // Auto-capture GPS on mount
  useEffect(() => {
    if (autoGps) {
      captureGps();
    }
  }, [autoGps, captureGps]);

  // Submit activity + photos
  const submitActivity = useCallback(
    async (formData: ActivityFormData, photos?: PendingPhoto[]) => {
      setLoading(true);
      setError(null);
      setPhotoUploadProgress(null);

      try {
        // Build availability fields if provided
        const availabilityFields: Record<string, boolean> = {};
        if (formData.availability) {
          Object.entries(formData.availability).forEach(([key, value]) => {
            const parts = key.split('_');
            const day = parts[0];
            const period = parts[1];
            const dbKey = `avail_${day}_${period}`;
            availabilityFields[dbKey] = value;
          });
        }

        const activityData = {
          user_id: userId,
          tabc_permit_number: permitNumber,
          activity_type: formData.activity_type,
          activity_date: formData.activity_date,
          notes: formData.notes || null,
          outcome: formData.outcome || null,
          next_followup_date: formData.next_followup_date || null,
          contact_name: formData.contact_name || null,
          contact_cell_phone: formData.contact_cell_phone || null,
          contact_email: formData.contact_email || null,
          contact_preferred_method: formData.contact_preferred_method || null,
          decision_maker: formData.decision_maker || false,
          conversation_summary: formData.conversation_summary || null,
          product_interest:
            formData.product_interest && formData.product_interest.length > 0
              ? formData.product_interest
              : null,
          current_products_carried: formData.current_products_carried || null,
          objections: formData.objections || null,
          competitors_mentioned:
            formData.competitors_mentioned && formData.competitors_mentioned.length > 0
              ? formData.competitors_mentioned
              : null,
          next_action: formData.next_action || null,
          gps_latitude: gpsLocation?.latitude || null,
          gps_longitude: gpsLocation?.longitude || null,
          gps_accuracy_meters: gpsLocation?.accuracy || null,
          ...availabilityFields,
        };

        // POST activity
        const response = await fetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(activityData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create activity');
        }

        const result = await response.json();
        const activityId = result.activity?.id;

        // Upload photos sequentially
        if (activityId && photos && photos.length > 0) {
          const photosToUpload = photos.slice(0, MAX_PHOTOS);
          setPhotoUploadProgress(`Uploading ${photosToUpload.length} photo(s)...`);

          for (let i = 0; i < photosToUpload.length; i++) {
            const photo = photosToUpload[i];
            setPhotoUploadProgress(`Photo ${i + 1} of ${photosToUpload.length}...`);

            const photoFormData = new FormData();
            photoFormData.append('file', photo.file);
            photoFormData.append('activityId', activityId);
            photoFormData.append('permitNumber', permitNumber);
            photoFormData.append('photoType', photo.type);

            const photoResponse = await fetch('/api/photos', {
              method: 'POST',
              body: photoFormData,
            });

            if (!photoResponse.ok) {
              const photoError = await photoResponse.json();
              console.error(`Photo ${i + 1} upload failed:`, photoError);
              // Continue with other photos
            }
          }
          setPhotoUploadProgress(null);
        }

        setLoading(false);
        onSuccess?.();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to create activity';
        setError(msg);
        setLoading(false);
      }
    },
    [userId, permitNumber, gpsLocation, onSuccess]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    submitActivity,
    loading,
    error,
    clearError,
    photoUploadProgress,
    gpsLocation,
    gpsError,
    captureGps,
  };
}
