/**
 * MapActivitySheet Component
 * Slide-up mobile form for logging activities without leaving the map view.
 * Simplified version of ActivityForm designed for quick mobile capture.
 */

'use client';

import { useState, useRef } from 'react';
import { format } from 'date-fns';
import {
  useActivitySubmit,
  compressPhoto,
  type PendingPhoto,
  type PhotoType,
  type ActivityFormData,
} from '@/lib/hooks/use-activity-submit';

interface MapActivitySheetProps {
  permitNumber: string;
  customerName: string;
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

// Brand colors
const brandColors = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
};

const ACTIVITY_TYPES = [
  { value: 'visit', label: 'Visit', icon: '🏢' },
  { value: 'call', label: 'Call', icon: '📞' },
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'note', label: 'Note', icon: '📝' },
] as const;

const OUTCOMES = [
  { value: '', label: 'Select outcome...' },
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
  { value: 'no_contact', label: 'No Contact' },
];

const PRODUCTS = ['beer', 'wine', 'spirits', 'equipment'];

export default function MapActivitySheet({
  permitNumber,
  customerName,
  userId,
  onSuccess,
  onCancel,
}: MapActivitySheetProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const {
    submitActivity,
    loading,
    error,
    clearError,
    photoUploadProgress,
    gpsLocation,
    gpsError,
    captureGps,
  } = useActivitySubmit({
    permitNumber,
    userId,
    onSuccess,
    autoGps: true,
  });

  // Form state
  const [activityType, setActivityType] = useState<'visit' | 'call' | 'email' | 'note'>('visit');
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<'' | 'positive' | 'neutral' | 'negative' | 'no_contact'>('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [productInterest, setProductInterest] = useState<string[]>([]);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  // Toggle product interest
  const toggleProduct = (product: string) => {
    setProductInterest((prev) =>
      prev.includes(product)
        ? prev.filter((p) => p !== product)
        : [...prev, product]
    );
  };

  // Handle photo from camera or gallery
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 5) {
      return; // Max 5 photos
    }

    for (const file of files) {
      const compressed = await compressPhoto(file);
      setPhotos((prev) => [
        ...prev,
        { file: compressed, type: 'other' as PhotoType, preview: URL.createObjectURL(compressed) },
      ]);
    }

    // Reset input
    if (e.target) e.target.value = '';
  };

  // Remove a pending photo
  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const removed = prev[index];
      if (removed.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Submit handler
  const handleSubmit = async () => {
    clearError();

    const formData: ActivityFormData = {
      activity_type: activityType,
      activity_date: format(new Date(), 'yyyy-MM-dd'),
      notes: notes || null,
      outcome: outcome || null,
      contact_name: contactName || null,
      contact_cell_phone: contactPhone || null,
      product_interest: productInterest.length > 0 ? productInterest : undefined,
    };

    await submitActivity(formData, photos);
  };

  // Format currency
  const formatGps = (loc: { latitude: number; longitude: number; accuracy: number }) => {
    return `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)} (±${Math.round(loc.accuracy)}m)`;
  };

  return (
    <>
      {/* Overlay backdrop */}
      <div style={styles.overlay} onClick={onCancel} />

      {/* Sheet */}
      <div style={styles.sheet}>
        {/* Handle bar */}
        <div style={styles.handleBar} />

        {/* Header */}
        <div style={styles.header}>
          <h3 style={styles.headerTitle}>Log Activity</h3>
          <p style={styles.headerSubtitle}>{customerName}</p>
        </div>

        {/* Scrollable form content */}
        <div style={styles.scrollContent}>
          {/* Error */}
          {error && (
            <div style={styles.errorBanner}>
              <span>⚠️ {error}</span>
              <button onClick={clearError} style={styles.errorDismiss}>×</button>
            </div>
          )}

          {/* GPS Status */}
          <div style={styles.gpsRow}>
            {gpsLocation ? (
              <span style={styles.gpsSuccess}>📍 {formatGps(gpsLocation)}</span>
            ) : gpsError ? (
              <span style={styles.gpsErrorText}>
                ⚠️ {gpsError}
                <button onClick={captureGps} style={styles.gpsRetry}>Retry</button>
              </span>
            ) : (
              <span style={styles.gpsLoading}>📍 Capturing GPS...</span>
            )}
          </div>

          {/* Activity Type - segmented control */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Type</label>
            <div style={styles.segmentedControl}>
              {ACTIVITY_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setActivityType(type.value)}
                  style={{
                    ...styles.segment,
                    ...(activityType === type.value ? styles.segmentActive : {}),
                  }}
                >
                  <span>{type.icon}</span>
                  <span style={styles.segmentLabel}>{type.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened? Key takeaways..."
              style={styles.textarea}
              rows={3}
            />
          </div>

          {/* Outcome */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Outcome</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as '' | 'positive' | 'neutral' | 'negative' | 'no_contact')}
              style={styles.select}
            >
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Contact fields side by side */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Contact</label>
            <div style={styles.contactRow}>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Name"
                style={{ ...styles.input, flex: 1 }}
              />
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Phone"
                style={{ ...styles.input, flex: 1 }}
              />
            </div>
          </div>

          {/* Product Interest - toggleable pills */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Product Interest</label>
            <div style={styles.pillRow}>
              {PRODUCTS.map((product) => (
                <button
                  key={product}
                  type="button"
                  onClick={() => toggleProduct(product)}
                  style={{
                    ...styles.pill,
                    ...(productInterest.includes(product) ? styles.pillActive : {}),
                  }}
                >
                  {product.charAt(0).toUpperCase() + product.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Photo capture */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Photos ({photos.length}/5)</label>
            <div style={styles.photoActions}>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                style={styles.photoButton}
                disabled={photos.length >= 5}
              >
                📷 Camera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={styles.photoButton}
                disabled={photos.length >= 5}
              >
                🖼️ Gallery
              </button>
            </div>

            {/* Hidden file inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
            />

            {/* Photo thumbnails */}
            {photos.length > 0 && (
              <div style={styles.photoThumbnails}>
                {photos.map((photo, index) => (
                  <div key={index} style={styles.thumbnailWrapper}>
                    {photo.preview && (
                      <img
                        src={photo.preview}
                        alt={`Photo ${index + 1}`}
                        style={styles.thumbnail}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      style={styles.thumbnailRemove}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fixed bottom actions */}
        <div style={styles.actions}>
          {photoUploadProgress && (
            <p style={styles.uploadProgress}>{photoUploadProgress}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              ...styles.submitButton,
              ...(loading ? styles.submitButtonDisabled : {}),
            }}
          >
            {loading ? 'Saving...' : 'Save Activity'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            style={styles.cancelButton}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 300,
  },
  sheet: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '85vh',
    backgroundColor: 'white',
    borderTopLeftRadius: '20px',
    borderTopRightRadius: '20px',
    zIndex: 301,
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 'env(safe-area-inset-bottom, 16px)',
  },
  handleBar: {
    width: '40px',
    height: '4px',
    backgroundColor: '#e2e8f0',
    borderRadius: '2px',
    margin: '12px auto 0',
    flexShrink: 0,
  },
  header: {
    padding: '12px 20px 8px',
    borderBottom: '1px solid #f1f5f9',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: brandColors.primaryDark,
    margin: 0,
  },
  headerSubtitle: {
    fontSize: '14px',
    color: '#64748b',
    margin: '2px 0 0',
  },
  scrollContent: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '12px 20px',
  },
  // GPS
  gpsRow: {
    padding: '8px 12px',
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    marginBottom: '12px',
    fontSize: '13px',
  },
  gpsSuccess: { color: '#16a34a' },
  gpsErrorText: {
    color: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  gpsLoading: { color: '#64748b' },
  gpsRetry: {
    padding: '2px 8px',
    border: '1px solid #dc2626',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: '#dc2626',
    fontSize: '12px',
    cursor: 'pointer',
  },
  // Error
  errorBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    backgroundColor: '#fee2e2',
    borderRadius: '8px',
    marginBottom: '12px',
    fontSize: '13px',
    color: '#991b1b',
  },
  errorDismiss: {
    border: 'none',
    background: 'none',
    color: '#991b1b',
    fontSize: '18px',
    cursor: 'pointer',
    padding: '0 4px',
  },
  // Fields
  fieldGroup: {
    marginBottom: '14px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#475569',
    marginBottom: '6px',
  },
  // Segmented control
  segmentedControl: {
    display: 'flex',
    gap: '4px',
    backgroundColor: '#f1f5f9',
    borderRadius: '10px',
    padding: '4px',
  },
  segment: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '2px',
    padding: '10px 4px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#64748b',
  },
  segmentActive: {
    backgroundColor: 'white',
    color: brandColors.primaryDark,
    fontWeight: '600',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  segmentLabel: {
    fontSize: '11px',
  },
  // Inputs
  textarea: {
    width: '100%',
    padding: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '15px',
    resize: 'none' as const,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    padding: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '15px',
    backgroundColor: 'white',
    boxSizing: 'border-box' as const,
  },
  input: {
    padding: '12px',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '15px',
    boxSizing: 'border-box' as const,
  },
  contactRow: {
    display: 'flex',
    gap: '8px',
  },
  // Product pills
  pillRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  pill: {
    padding: '8px 16px',
    border: '1px solid #e2e8f0',
    borderRadius: '20px',
    backgroundColor: 'white',
    fontSize: '14px',
    color: '#64748b',
    cursor: 'pointer',
  },
  pillActive: {
    backgroundColor: brandColors.primaryLight,
    borderColor: brandColors.primary,
    color: brandColors.primaryDark,
    fontWeight: '600',
  },
  // Photos
  photoActions: {
    display: 'flex',
    gap: '8px',
  },
  photoButton: {
    flex: 1,
    padding: '12px',
    border: '1px dashed #cbd5e1',
    borderRadius: '8px',
    backgroundColor: '#f8fafc',
    fontSize: '14px',
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  photoThumbnails: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
    flexWrap: 'wrap' as const,
  },
  thumbnailWrapper: {
    position: 'relative' as const,
    width: '60px',
    height: '60px',
  },
  thumbnail: {
    width: '60px',
    height: '60px',
    objectFit: 'cover' as const,
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  },
  thumbnailRemove: {
    position: 'absolute' as const,
    top: '-6px',
    right: '-6px',
    width: '20px',
    height: '20px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: '#ef4444',
    color: 'white',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Actions
  actions: {
    padding: '12px 20px',
    borderTop: '1px solid #f1f5f9',
    flexShrink: 0,
  },
  uploadProgress: {
    fontSize: '13px',
    color: brandColors.primary,
    textAlign: 'center' as const,
    margin: '0 0 8px',
  },
  submitButton: {
    width: '100%',
    padding: '14px',
    border: 'none',
    borderRadius: '12px',
    backgroundColor: brandColors.primary,
    color: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '8px',
  },
  submitButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  cancelButton: {
    width: '100%',
    padding: '12px',
    border: 'none',
    borderRadius: '12px',
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    fontSize: '15px',
    fontWeight: '500',
    cursor: 'pointer',
  },
};
