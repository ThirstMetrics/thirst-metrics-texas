/**
 * Photo Viewer Component
 * Modal/lightbox to view photos with OCR text toggle
 *
 * Features:
 * - Full-size photo display
 * - Toggle between photo view and OCR text view
 * - Navigation arrows for multiple photos
 * - Photo metadata display
 * - Click outside or X to close
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Brand colors
const brandColors = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
};

export interface Photo {
  id: string;
  photo_url: string;
  photo_type?: string;
  file_size_bytes?: number;
  ocr_text?: string | null;
  ocr_processed_at?: string | null;
  uploaded_at?: string;
  /** New fields for annotated view — optional for backward compat */
  ocr_image_width?: number | null;
  ocr_image_height?: number | null;
  ocr_word_count?: number | null;
}

interface WordOverlay {
  word_index: number;
  raw_text: string;
  corrected_text: string;
  confidence: number;
  bbox_x0: number;
  bbox_y0: number;
  bbox_x1: number;
  bbox_y1: number;
  was_corrected: boolean;
  correction_source: string | null;
}

interface PhotoViewerProps {
  photos: Photo[];
  initialIndex?: number;
  onClose: () => void;
}

type ViewMode = 'photo' | 'text' | 'annotated';

export default function PhotoViewer(props: PhotoViewerProps) {
  const { photos, initialIndex = 0, onClose } = props;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [viewMode, setViewMode] = useState<ViewMode>('photo');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [wordData, setWordData] = useState<WordOverlay[]>([]);
  const [wordDataLoading, setWordDataLoading] = useState(false);
  const [annotatedImgSize, setAnnotatedImgSize] = useState<{ w: number; h: number } | null>(null);
  const annotatedImgRef = useRef<HTMLImageElement>(null);

  const currentPhoto = photos[currentIndex];
  const hasMultiple = photos.length > 1;
  const hasOCRText = !!currentPhoto?.ocr_text;
  const hasWordData = wordData.length > 0;

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasMultiple) {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
        setImageLoaded(false);
      } else if (e.key === 'ArrowRight' && hasMultiple) {
        setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
        setImageLoaded(false);
      } else if (e.key === 't' || e.key === 'T') {
        if (hasOCRText || hasWordData) {
          setViewMode((prev) => {
            if (prev === 'photo') return hasWordData ? 'annotated' : 'text';
            if (prev === 'annotated') return hasOCRText ? 'text' : 'photo';
            return 'photo';
          });
        }
      }
    },
    [onClose, hasMultiple, hasOCRText, hasWordData, photos.length]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [handleKeyDown]);

  // Reset view mode and word data when changing photos
  useEffect(() => {
    setViewMode('photo');
    setWordData([]);
    setAnnotatedImgSize(null);
  }, [currentIndex]);

  // Fetch word data for annotated view
  useEffect(() => {
    if (!currentPhoto?.id) return;
    // Only fetch if the photo has word-level data (ocr_word_count > 0)
    if (currentPhoto.ocr_word_count && currentPhoto.ocr_word_count > 0 && wordData.length === 0) {
      setWordDataLoading(true);
      fetch(`/api/admin/ocr/words/${currentPhoto.id}`)
        .then(res => res.json())
        .then(data => setWordData(data.words || []))
        .catch(() => setWordData([]))
        .finally(() => setWordDataLoading(false));
    }
  }, [currentPhoto?.id, currentPhoto?.ocr_word_count, wordData.length]);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
    setImageLoaded(false);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
    setImageLoaded(false);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formatPhotoType = (type?: string) => {
    if (!type) return 'Other';
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  if (!currentPhoto) {
    return null;
  }

  return (
    <div style={styles.backdrop} onClick={handleBackdropClick}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.photoType}>{formatPhotoType(currentPhoto.photo_type)}</span>
            {hasMultiple && (
              <span style={styles.counter}>
                {currentIndex + 1} / {photos.length}
              </span>
            )}
          </div>
          <div style={styles.headerRight}>
            {(hasOCRText || hasWordData) && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setViewMode('photo')}
                  style={{
                    ...styles.toggleButton,
                    backgroundColor: viewMode === 'photo' ? brandColors.primary : 'white',
                    color: viewMode === 'photo' ? 'white' : brandColors.primary,
                    borderRadius: '6px 0 0 6px',
                  }}
                >
                  Photo
                </button>
                {hasWordData && (
                  <button
                    onClick={() => setViewMode('annotated')}
                    style={{
                      ...styles.toggleButton,
                      backgroundColor: viewMode === 'annotated' ? brandColors.primary : 'white',
                      color: viewMode === 'annotated' ? 'white' : brandColors.primary,
                      borderRadius: '0',
                    }}
                  >
                    Annotated
                  </button>
                )}
                {hasOCRText && (
                  <button
                    onClick={() => setViewMode('text')}
                    style={{
                      ...styles.toggleButton,
                      backgroundColor: viewMode === 'text' ? brandColors.primary : 'white',
                      color: viewMode === 'text' ? 'white' : brandColors.primary,
                      borderRadius: hasWordData ? '0 6px 6px 0' : '0 6px 6px 0',
                    }}
                  >
                    Text
                  </button>
                )}
              </div>
            )}
            <button onClick={onClose} style={styles.closeButton} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {viewMode === 'photo' && (
            <div style={styles.imageContainer}>
              {!imageLoaded && <div style={styles.loading}>Loading...</div>}
              <img
                src={currentPhoto.photo_url}
                alt={`Photo ${currentIndex + 1}`}
                style={{
                  ...styles.image,
                  opacity: imageLoaded ? 1 : 0,
                }}
                onLoad={() => setImageLoaded(true)}
              />
            </div>
          )}
          {viewMode === 'text' && (
            <div style={styles.textContainer}>
              <div style={styles.textHeader}>
                <span style={styles.textLabel}>OCR Extracted Text</span>
                {currentPhoto.ocr_processed_at && (
                  <span style={styles.textMeta}>
                    Processed: {formatDate(currentPhoto.ocr_processed_at)}
                  </span>
                )}
              </div>
              <pre style={styles.ocrText}>
                {currentPhoto.ocr_text || 'No text extracted'}
              </pre>
            </div>
          )}
          {viewMode === 'annotated' && (
            <div style={styles.imageContainer}>
              {wordDataLoading && <div style={styles.loading}>Loading word data...</div>}
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  ref={annotatedImgRef}
                  src={currentPhoto.photo_url}
                  alt={`Annotated ${currentIndex + 1}`}
                  style={{
                    ...styles.image,
                    opacity: annotatedImgSize ? 1 : 0,
                  }}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setAnnotatedImgSize({
                      w: img.clientWidth,
                      h: img.clientHeight,
                    });
                  }}
                />
                {annotatedImgSize && wordData.length > 0 && (() => {
                  const ocrW = currentPhoto.ocr_image_width || annotatedImgRef.current?.naturalWidth || 1;
                  const ocrH = currentPhoto.ocr_image_height || annotatedImgRef.current?.naturalHeight || 1;
                  const scaleX = annotatedImgSize.w / ocrW;
                  const scaleY = annotatedImgSize.h / ocrH;
                  return (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: annotatedImgSize.w,
                      height: annotatedImgSize.h,
                      pointerEvents: 'none',
                    }}>
                      {wordData.filter(w => w.was_corrected).map(w => {
                        const left = w.bbox_x0 * scaleX;
                        const top = w.bbox_y0 * scaleY;
                        const width = (w.bbox_x1 - w.bbox_x0) * scaleX;
                        const height = (w.bbox_y1 - w.bbox_y0) * scaleY;
                        if (width <= 0 || height <= 0) return null;

                        const bgColor = w.correction_source === 'learned'
                          ? 'rgba(34, 211, 230, 0.3)'
                          : w.correction_source === 'user'
                            ? 'rgba(34, 197, 94, 0.3)'
                            : 'rgba(255, 200, 0, 0.3)';
                        const borderColor = w.correction_source === 'learned'
                          ? '#22d3e6'
                          : w.correction_source === 'user'
                            ? '#22c55e'
                            : '#eab308';

                        return (
                          <div
                            key={w.word_index}
                            title={`${w.raw_text} → ${w.corrected_text} (${w.confidence.toFixed(0)}%)`}
                            style={{
                              position: 'absolute',
                              left,
                              top,
                              width,
                              height,
                              backgroundColor: bgColor,
                              border: `1.5px solid ${borderColor}`,
                              borderRadius: '2px',
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              {/* Legend */}
              {wordData.some(w => w.was_corrected) && (
                <div style={{
                  display: 'flex',
                  gap: '16px',
                  justifyContent: 'center',
                  paddingTop: '8px',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#aaa' }}>
                    <span style={{ width: 12, height: 12, background: 'rgba(255,200,0,0.4)', border: '1px solid #eab308', borderRadius: 2, display: 'inline-block' }} />
                    Dictionary
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#aaa' }}>
                    <span style={{ width: 12, height: 12, background: 'rgba(34,211,230,0.4)', border: '1px solid #22d3e6', borderRadius: 2, display: 'inline-block' }} />
                    Learned
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#aaa' }}>
                    <span style={{ width: 12, height: 12, background: 'rgba(34,197,94,0.4)', border: '1px solid #22c55e', borderRadius: 2, display: 'inline-block' }} />
                    User
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation arrows */}
        {hasMultiple && (
          <>
            <button onClick={handlePrev} style={styles.navButtonLeft} aria-label="Previous">
              ‹
            </button>
            <button onClick={handleNext} style={styles.navButtonRight} aria-label="Next">
              ›
            </button>
          </>
        )}

        {/* Footer metadata */}
        <div style={styles.footer}>
          <div style={styles.footerMeta}>
            {currentPhoto.file_size_bytes && (
              <span style={styles.metaItem}>{formatFileSize(currentPhoto.file_size_bytes)}</span>
            )}
            {currentPhoto.uploaded_at && (
              <span style={styles.metaItem}>Uploaded: {formatDate(currentPhoto.uploaded_at)}</span>
            )}
            {hasOCRText && <span style={styles.metaItem}>✓ OCR processed</span>}
          </div>
          <div style={styles.footerHelp}>
            {hasMultiple && <span>← → to navigate</span>}
            {(hasOCRText || hasWordData) && <span>T to cycle views</span>}
            <span>ESC to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px',
  },
  modal: {
    position: 'relative',
    width: '100%',
    maxWidth: '1200px',
    maxHeight: '90vh',
    backgroundColor: '#1a1a1a',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #333',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  photoType: {
    backgroundColor: brandColors.primary,
    color: 'white',
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '13px',
    fontWeight: '500',
  },
  counter: {
    color: '#888',
    fontSize: '14px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  toggleButton: {
    padding: '8px 16px',
    border: `1px solid ${brandColors.primary}`,
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  closeButton: {
    width: '40px',
    height: '40px',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'white',
    fontSize: '32px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    transition: 'background-color 0.2s',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  loading: {
    position: 'absolute',
    color: '#666',
    fontSize: '16px',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '70vh',
    objectFit: 'contain',
    borderRadius: '4px',
    transition: 'opacity 0.3s',
  },
  textContainer: {
    width: '100%',
    height: '100%',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
  },
  textHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  textLabel: {
    color: brandColors.accent,
    fontSize: '14px',
    fontWeight: '600',
  },
  textMeta: {
    color: '#666',
    fontSize: '12px',
  },
  ocrText: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    color: '#e0e0e0',
    padding: '20px',
    borderRadius: '8px',
    fontFamily: "'Courier New', Consolas, monospace",
    fontSize: '14px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflow: 'auto',
    margin: 0,
  },
  navButtonLeft: {
    position: 'absolute',
    left: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '50px',
    height: '50px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: '50%',
    color: 'white',
    fontSize: '32px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  navButtonRight: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '50px',
    height: '50px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: '50%',
    color: 'white',
    fontSize: '32px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderTop: '1px solid #333',
  },
  footerMeta: {
    display: 'flex',
    gap: '16px',
  },
  metaItem: {
    color: '#888',
    fontSize: '12px',
  },
  footerHelp: {
    display: 'flex',
    gap: '16px',
    color: '#555',
    fontSize: '11px',
  },
};
