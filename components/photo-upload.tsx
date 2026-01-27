/**
 * Photo Upload Component
 * Handles photo upload with compression and OCR
 */

'use client';

import { useState, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import { createWorker } from 'tesseract.js';
import { supabase } from '@/lib/supabase/client';

interface PhotoUploadProps {
  permitNumber: string;
  activityId?: string;
  onUploadComplete: (photoUrls: string[]) => void;
}

export default function PhotoUpload(props: PhotoUploadProps) {
  const { permitNumber, activityId, onUploadComplete } = props;
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Record<number, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const MAX_PHOTOS = 5;
  const MAX_SIZE_MB = 0.5;
  const MAX_DIMENSION = 1920;
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (photos.length + files.length > MAX_PHOTOS) {
      alert(`Maximum ${MAX_PHOTOS} photos allowed`);
      return;
    }
    
    // Compress images
    const compressedFiles: File[] = [];
    for (const file of files) {
      try {
        const compressed = await imageCompression(file, {
          maxSizeMB: MAX_SIZE_MB,
          maxWidthOrHeight: MAX_DIMENSION,
          useWebWorker: true,
        });
        compressedFiles.push(compressed);
      } catch (error) {
        console.error('Compression error:', error);
        compressedFiles.push(file); // Use original if compression fails
      }
    }
    
    setPhotos([...photos, ...compressedFiles]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleUpload = async () => {
    if (photos.length === 0) return;
    
    setUploading(true);
    const uploadedUrls: string[] = [];
    
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const fileExt = photo.name.split('.').pop();
      const fileName = `${permitNumber}_${Date.now()}_${i}.${fileExt}`;
      const filePath = `activities/${fileName}`;
      
      try {
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('activity-photos')
          .upload(filePath, photo, {
            cacheControl: '3600',
            upsert: false,
          });
        
        if (uploadError) {
          throw uploadError;
        }
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('activity-photos')
          .getPublicUrl(filePath);
        
        const photoUrl = urlData.publicUrl;
        uploadedUrls.push(photoUrl);
        
        // Run OCR
        let ocrText = '';
        try {
          const worker = await createWorker('eng');
          const { data: { text } } = await worker.recognize(photo);
          ocrText = text;
          await worker.terminate();
        } catch (ocrError) {
          console.error('OCR error:', ocrError);
        }
        
        // If activityId is provided, create photo record
        if (activityId) {
          const { error: dbError } = await supabase
            .from('activity_photos')
            .insert({
              activity_id: activityId,
              photo_url: photoUrl,
              file_size_bytes: photo.size,
              photo_type: 'other',
              ocr_text: ocrText || null,
              ocr_processed_at: ocrText ? new Date().toISOString() : null,
            });
          
          if (dbError) {
            console.error('Database error:', dbError);
          }
        }
        
        setProgress((prev) => ({ ...prev, [i]: 100 }));
      } catch (error) {
        console.error('Upload error:', error);
        alert(`Failed to upload photo ${i + 1}`);
      }
    }
    
    setUploading(false);
    setPhotos([]);
    onUploadComplete(uploadedUrls);
  };
  
  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };
  
  return (
    <div style={styles.container}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        style={styles.fileInput}
        disabled={uploading || photos.length >= MAX_PHOTOS}
      />
      
      {photos.length > 0 && (
        <div style={styles.photos}>
          {photos.map((photo, index) => (
            <div key={index} style={styles.photoItem}>
              <img
                src={URL.createObjectURL(photo)}
                alt={`Preview ${index + 1}`}
                style={styles.preview}
              />
              <div style={styles.photoInfo}>
                <div style={styles.photoName}>{photo.name}</div>
                <div style={styles.photoSize}>
                  {(photo.size / 1024).toFixed(1)} KB
                </div>
              </div>
              <button
                type="button"
                onClick={() => removePhoto(index)}
                style={styles.removeButton}
                disabled={uploading}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      
      {photos.length > 0 && (
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          style={styles.uploadButton}
        >
          {uploading ? 'Uploading...' : `Upload ${photos.length} Photo${photos.length > 1 ? 's' : ''}`}
        </button>
      )}
      
      <div style={styles.helpText}>
        Maximum {MAX_PHOTOS} photos, {MAX_SIZE_MB}MB each, {MAX_DIMENSION}px max dimension
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  fileInput: {
    padding: '10px',
    border: '1px dashed #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  photos: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '12px',
  },
  photoItem: {
    position: 'relative' as const,
    border: '1px solid #ddd',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
    height: '150px',
    objectFit: 'cover' as const,
  },
  photoInfo: {
    padding: '8px',
    fontSize: '12px',
  },
  photoName: {
    fontWeight: '500',
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  photoSize: {
    color: '#666',
    fontSize: '11px',
  },
  removeButton: {
    position: 'absolute' as const,
    top: '4px',
    right: '4px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.6)',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButton: {
    padding: '10px 20px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  helpText: {
    fontSize: '12px',
    color: '#999',
  },
};
