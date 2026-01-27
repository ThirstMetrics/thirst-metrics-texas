/**
 * Activity Form Component
 * Full CRM activity logging form with all fields.
 * Includes photo picker (compression + OCR), GPS capture, and availability.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/supabase/client';
import { uploadActivityPhoto, type PhotoType } from '@/lib/activity-photos';

const MAX_PHOTOS = typeof process.env.NEXT_PUBLIC_MAX_PHOTOS_PER_ACTIVITY === 'string'
  ? Math.min(10, Math.max(1, parseInt(process.env.NEXT_PUBLIC_MAX_PHOTOS_PER_ACTIVITY, 10) || 5))
  : 5;

interface ActivityFormProps {
  permitNumber: string;
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ActivityForm(props: ActivityFormProps) {
  const { permitNumber, userId, onSuccess, onCancel } = props;
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gpsLocation, setGpsLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    activity_type: 'visit' as 'visit' | 'call' | 'email' | 'note',
    activity_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '',
    outcome: '' as '' | 'positive' | 'neutral' | 'negative' | 'no_contact',
    next_followup_date: '',
    contact_name: '',
    contact_cell_phone: '',
    contact_email: '',
    contact_preferred_method: '' as '' | 'text' | 'call' | 'email' | 'in_person',
    decision_maker: false,
    conversation_summary: '',
    product_interest: [] as string[],
    current_products_carried: '',
    objections: '',
    competitors_mentioned: [] as string[],
    next_action: '',
    availability: {
      monday_am: false,
      monday_pm: false,
      tuesday_am: false,
      tuesday_pm: false,
      wednesday_am: false,
      wednesday_pm: false,
      thursday_am: false,
      thursday_pm: false,
      friday_am: false,
      friday_pm: false,
      saturday_am: false,
      saturday_pm: false,
      sunday_am: false,
      sunday_pm: false,
    },
  });
  
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [pendingPhotoType, setPendingPhotoType] = useState<PhotoType>('other');
  const [photoUploadProgress, setPhotoUploadProgress] = useState<string | null>(null);
  
  // Capture GPS on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy || 0,
          });
        },
        (err) => {
          setGpsError(`GPS error: ${err.message}`);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    } else {
      setGpsError('Geolocation not supported');
    }
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      // Build availability object for database
      const availabilityFields: Record<string, boolean> = {};
      Object.entries(formData.availability).forEach(([key, value]) => {
        // Convert monday_am to avail_monday_am format
        const parts = key.split('_');
        const day = parts[0];
        const period = parts[1];
        const dbKey = `avail_${day}_${period}`;
        availabilityFields[dbKey] = value;
      });
      
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
        decision_maker: formData.decision_maker,
        conversation_summary: formData.conversation_summary || null,
        product_interest: formData.product_interest.length > 0 ? formData.product_interest : null,
        current_products_carried: formData.current_products_carried || null,
        objections: formData.objections || null,
        competitors_mentioned: formData.competitors_mentioned.length > 0 ? formData.competitors_mentioned : null,
        next_action: formData.next_action || null,
        gps_latitude: gpsLocation?.latitude || null,
        gps_longitude: gpsLocation?.longitude || null,
        gps_accuracy_meters: gpsLocation?.accuracy || null,
        ...availabilityFields,
      };
      
      const response = await fetch('/api/activities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(activityData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create activity');
      }
      
      const result = await response.json();
      const activityId = result.activity?.id;
      
      if (activityId && pendingPhotos.length > 0) {
        setPhotoUploadProgress(`Uploading ${pendingPhotos.length} photo(s)...`);
        for (let i = 0; i < pendingPhotos.length; i++) {
          setPhotoUploadProgress(`Photo ${i + 1} of ${pendingPhotos.length}...`);
          await uploadActivityPhoto(
            supabase,
            activityId,
            pendingPhotos[i],
            permitNumber,
            pendingPhotoType
          );
        }
        setPhotoUploadProgress(null);
      }
      
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to create activity');
      setLoading(false);
    }
  };
  
  const handleProductInterestChange = (product: string, checked: boolean) => {
    if (checked) {
      setFormData({
        ...formData,
        product_interest: [...formData.product_interest, product],
      });
    } else {
      setFormData({
        ...formData,
        product_interest: formData.product_interest.filter((p) => p !== product),
      });
    }
  };
  
  const handleCompetitorChange = (competitor: string) => {
    const competitors = competitor.split(',').map((c) => c.trim()).filter((c) => c);
    setFormData({
      ...formData,
      competitors_mentioned: competitors,
    });
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (pendingPhotos.length + files.length > MAX_PHOTOS) {
      setError(`Maximum ${MAX_PHOTOS} photos per activity.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setError(null);
    const compressed: File[] = [];
    for (const file of files) {
      try {
        const c = await imageCompression(file, {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        });
        compressed.push(c);
      } catch {
        compressed.push(file);
      }
    }
    setPendingPhotos((prev) => [...prev, ...compressed]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingPhoto = (index: number) => {
    setPendingPhotos((prev) => prev.filter((_, i) => i !== index));
  };
  
  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.header}>
        <h2 style={styles.title}>Log Activity</h2>
        <button type="button" onClick={onCancel} style={styles.cancelButton}>
          Cancel
        </button>
      </div>
      
      {error && (
        <div style={styles.error}>{error}</div>
      )}
      
      {/* GPS Status */}
      <div style={styles.gpsStatus}>
        {gpsLocation ? (
          <div style={styles.gpsSuccess}>
            ✓ GPS captured: {gpsLocation.latitude.toFixed(6)}, {gpsLocation.longitude.toFixed(6)}
            {gpsLocation.accuracy > 0 && ` (accuracy: ${Math.round(gpsLocation.accuracy)}m)`}
          </div>
        ) : gpsError ? (
          <div style={styles.gpsError}>⚠ {gpsError}</div>
        ) : (
          <div style={styles.gpsLoading}>Capturing GPS location...</div>
        )}
      </div>
      
      {/* Basic Info */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Basic Information</h3>
        <div style={styles.fieldGrid}>
          <div style={styles.field}>
            <label style={styles.label}>Activity Type *</label>
            <select
              value={formData.activity_type}
              onChange={(e) => setFormData({ ...formData, activity_type: e.target.value as any })}
              required
              style={styles.select}
            >
              <option value="visit">Visit</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="note">Note</option>
            </select>
          </div>
          
          <div style={styles.field}>
            <label style={styles.label}>Activity Date *</label>
            <input
              type="date"
              value={formData.activity_date}
              onChange={(e) => setFormData({ ...formData, activity_date: e.target.value })}
              required
              style={styles.input}
            />
          </div>
          
          <div style={styles.field}>
            <label style={styles.label}>Outcome</label>
            <select
              value={formData.outcome}
              onChange={(e) => setFormData({ ...formData, outcome: e.target.value as any })}
              style={styles.select}
            >
              <option value="">Select outcome...</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
              <option value="no_contact">No Contact</option>
            </select>
          </div>
          
          <div style={styles.field}>
            <label style={styles.label}>Next Follow-up Date</label>
            <input
              type="date"
              value={formData.next_followup_date}
              onChange={(e) => setFormData({ ...formData, next_followup_date: e.target.value })}
              style={styles.input}
            />
          </div>
        </div>
        
        <div style={styles.field}>
          <label style={styles.label}>Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={4}
            style={styles.textarea}
            placeholder="Enter activity notes..."
          />
        </div>
      </div>
      
      {/* Contact Information */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Contact Information</h3>
        <div style={styles.fieldGrid}>
          <div style={styles.field}>
            <label style={styles.label}>Contact Name</label>
            <input
              type="text"
              value={formData.contact_name}
              onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
              style={styles.input}
            />
          </div>
          
          <div style={styles.field}>
            <label style={styles.label}>Cell Phone</label>
            <input
              type="tel"
              value={formData.contact_cell_phone}
              onChange={(e) => setFormData({ ...formData, contact_cell_phone: e.target.value })}
              style={styles.input}
            />
          </div>
          
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={formData.contact_email}
              onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
              style={styles.input}
            />
          </div>
          
          <div style={styles.field}>
            <label style={styles.label}>Preferred Method</label>
            <select
              value={formData.contact_preferred_method}
              onChange={(e) => setFormData({ ...formData, contact_preferred_method: e.target.value as any })}
              style={styles.select}
            >
              <option value="">Select method...</option>
              <option value="text">Text</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="in_person">In Person</option>
            </select>
          </div>
        </div>
        
        <div style={styles.field}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={formData.decision_maker}
              onChange={(e) => setFormData({ ...formData, decision_maker: e.target.checked })}
              style={styles.checkbox}
            />
            Decision Maker
          </label>
        </div>
      </div>
      
      {/* Sales Intel */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Sales Intelligence</h3>
        
        <div style={styles.field}>
          <label style={styles.label}>Conversation Summary</label>
          <textarea
            value={formData.conversation_summary}
            onChange={(e) => setFormData({ ...formData, conversation_summary: e.target.value })}
            rows={3}
            style={styles.textarea}
            placeholder="Summary of the conversation..."
          />
        </div>
        
        <div style={styles.field}>
          <label style={styles.label}>Product Interest</label>
          <div style={styles.checkboxGroup}>
            {['beer', 'wine', 'spirits', 'equipment'].map((product) => (
              <label key={product} style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.product_interest.includes(product)}
                  onChange={(e) => handleProductInterestChange(product, e.target.checked)}
                  style={styles.checkbox}
                />
                {product.charAt(0).toUpperCase() + product.slice(1)}
              </label>
            ))}
          </div>
        </div>
        
        <div style={styles.field}>
          <label style={styles.label}>Current Products Carried</label>
          <textarea
            value={formData.current_products_carried}
            onChange={(e) => setFormData({ ...formData, current_products_carried: e.target.value })}
            rows={2}
            style={styles.textarea}
            placeholder="List current products..."
          />
        </div>
        
        <div style={styles.field}>
          <label style={styles.label}>Objections</label>
          <textarea
            value={formData.objections}
            onChange={(e) => setFormData({ ...formData, objections: e.target.value })}
            rows={2}
            style={styles.textarea}
            placeholder="Any objections raised..."
          />
        </div>
        
        <div style={styles.field}>
          <label style={styles.label}>Competitors Mentioned</label>
          <input
            type="text"
            value={formData.competitors_mentioned.join(', ')}
            onChange={(e) => handleCompetitorChange(e.target.value)}
            style={styles.input}
            placeholder="Comma-separated list of competitors"
          />
        </div>
        
        <div style={styles.field}>
          <label style={styles.label}>Next Action</label>
          <textarea
            value={formData.next_action}
            onChange={(e) => setFormData({ ...formData, next_action: e.target.value })}
            rows={2}
            style={styles.textarea}
            placeholder="What's the next action item?"
          />
        </div>
      </div>
      
      {/* Availability */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Availability</h3>
        <div style={styles.availabilityGrid}>
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
            <div key={day} style={styles.availabilityDay}>
              <strong>{day}</strong>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.availability[`${day.toLowerCase()}_am` as keyof typeof formData.availability]}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      availability: {
                        ...formData.availability,
                        [`${day.toLowerCase()}_am`]: e.target.checked,
                      },
                    })
                  }
                  style={styles.checkbox}
                />
                AM
              </label>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.availability[`${day.toLowerCase()}_pm` as keyof typeof formData.availability]}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      availability: {
                        ...formData.availability,
                        [`${day.toLowerCase()}_pm`]: e.target.checked,
                      },
                    })
                  }
                  style={styles.checkbox}
                />
                PM
              </label>
            </div>
          ))}
        </div>
      </div>
      
      {/* Photo Upload - compression and OCR run when activity is saved */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Photos (Optional)</h3>
        <p style={styles.helpText}>
          Add up to {MAX_PHOTOS} photos. They will be compressed, uploaded, and OCR processed when you save.
        </p>
        <div style={styles.field}>
          <label style={styles.label}>Photo type</label>
          <select
            value={pendingPhotoType}
            onChange={(e) => setPendingPhotoType(e.target.value as PhotoType)}
            style={styles.select}
          >
            <option value="other">Other</option>
            <option value="receipt">Receipt</option>
            <option value="menu">Menu</option>
            <option value="product_display">Product display</option>
            <option value="shelf">Shelf</option>
          </select>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotoSelect}
          style={styles.fileInput}
          disabled={loading || pendingPhotos.length >= MAX_PHOTOS}
        />
        {pendingPhotos.length > 0 && (
          <div style={styles.photos}>
            {pendingPhotos.map((file, index) => (
              <div key={index} style={styles.photoItem}>
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Preview ${index + 1}`}
                  style={styles.preview}
                />
                <div style={styles.photoMeta}>
                  {(file.size / 1024).toFixed(1)} KB
                </div>
                <button
                  type="button"
                  onClick={() => removePendingPhoto(index)}
                  style={styles.removePhotoBtn}
                  disabled={loading}
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {photoUploadProgress && (
          <div style={styles.photoProgress}>{photoUploadProgress}</div>
        )}
      </div>
      
      {/* Submit */}
      <div style={styles.actions}>
        <button type="submit" disabled={loading} style={styles.submitButton}>
          {loading ? 'Saving...' : 'Save Activity'}
        </button>
        <button type="button" onClick={onCancel} style={styles.cancelButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const styles = {
  form: {
    background: 'white',
    borderRadius: '8px',
    padding: '24px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#333',
  },
  cancelButton: {
    padding: '8px 16px',
    background: '#999',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  error: {
    padding: '12px',
    background: '#fee',
    color: '#c33',
    borderRadius: '6px',
    marginBottom: '20px',
  },
  gpsStatus: {
    marginBottom: '20px',
    padding: '12px',
    background: '#f5f5f5',
    borderRadius: '6px',
  },
  gpsSuccess: {
    color: '#43e97b',
    fontSize: '14px',
  },
  gpsError: {
    color: '#ff6b6b',
    fontSize: '14px',
  },
  gpsLoading: {
    color: '#666',
    fontSize: '14px',
  },
  section: {
    marginBottom: '32px',
    paddingBottom: '24px',
    borderBottom: '1px solid #eee',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '16px',
    color: '#333',
  },
  fieldGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '16px',
  },
  field: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
  },
  input: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
  },
  select: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
  },
  textarea: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  checkboxGroup: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  checkbox: {
    cursor: 'pointer',
  },
  availabilityGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '16px',
  },
  availabilityDay: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  submitButton: {
    padding: '12px 24px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  helpText: {
    fontSize: '12px',
    color: '#999',
    marginTop: '8px',
  },
  fileInput: {
    padding: '10px',
    border: '1px dashed #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    marginTop: '8px',
  },
  photos: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: '12px',
    marginTop: '12px',
  },
  photoItem: {
    position: 'relative' as const,
    border: '1px solid #ddd',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
    height: '100px',
    objectFit: 'cover' as const,
  },
  photoMeta: {
    padding: '4px 8px',
    fontSize: '11px',
    color: '#666',
  },
  removePhotoBtn: {
    position: 'absolute' as const,
    top: '4px',
    right: '4px',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.6)',
    color: 'white',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoProgress: {
    marginTop: '12px',
    fontSize: '14px',
    color: '#667eea',
  },
};
