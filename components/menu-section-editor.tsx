/**
 * Menu Section Editor Component
 * Canvas overlay for drawing bounding box rectangles on photos to classify
 * menu sections (cocktails, draft beers, wines, etc.). Supports:
 * - Click and drag to draw new section rectangles
 * - Section type dropdown on completion
 * - Click to select existing sections
 * - Resize handles on selected sections
 * - Delete selected sections
 * - Save/load from API
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// ============================================
// Types
// ============================================

export interface MenuSection {
  id?: string;
  section_type: string;
  bbox_x0: number;
  bbox_y0: number;
  bbox_x1: number;
  bbox_y1: number;
  label?: string;
}

interface MenuSectionEditorProps {
  photoUrl: string;
  photoId: string;
  ocrImageWidth: number | null;
  ocrImageHeight: number | null;
}

type DrawState =
  | { mode: 'idle' }
  | { mode: 'drawing'; startX: number; startY: number; currentX: number; currentY: number }
  | { mode: 'assigning'; bbox: { x0: number; y0: number; x1: number; y1: number } };

// ============================================
// Constants
// ============================================

const SECTION_TYPES = [
  { value: 'cocktails', label: 'Cocktails', color: '#f59e0b' },
  { value: 'wines_by_glass', label: 'Wines by Glass', color: '#8b5cf6' },
  { value: 'draft_beers', label: 'Draft Beers', color: '#f97316' },
  { value: 'bottled_beers', label: 'Bottled Beers', color: '#d97706' },
  { value: 'spirits_list', label: 'Spirits', color: '#ec4899' },
  { value: 'wine_list', label: 'Wine List', color: '#a855f7' },
  { value: 'sake_by_glass', label: 'Sake (Glass)', color: '#14b8a6' },
  { value: 'sake_by_bottle', label: 'Sake (Bottle)', color: '#0d9488' },
  { value: 'food', label: 'Food', color: '#84cc16' },
  { value: 'other', label: 'Other', color: '#6b7280' },
] as const;

const BRAND = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
};

function getSectionColor(sectionType: string): string {
  return SECTION_TYPES.find(t => t.value === sectionType)?.color || '#6b7280';
}

function getSectionLabel(sectionType: string): string {
  return SECTION_TYPES.find(t => t.value === sectionType)?.label || sectionType;
}

// ============================================
// Main Component
// ============================================

export default function MenuSectionEditor({
  photoUrl,
  photoId,
  ocrImageWidth,
  ocrImageHeight,
}: MenuSectionEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // State
  const [sections, setSections] = useState<MenuSection[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [drawState, setDrawState] = useState<DrawState>({ mode: 'idle' });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Scale factors for coordinate mapping
  const sourceWidth = ocrImageWidth ?? naturalSize?.width ?? 1;
  const sourceHeight = ocrImageHeight ?? naturalSize?.height ?? 1;
  const scaleX = displaySize ? displaySize.width / sourceWidth : 1;
  const scaleY = displaySize ? displaySize.height / sourceHeight : 1;

  // ----------------------------------------
  // Fetch existing sections
  // ----------------------------------------

  const fetchSections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/photos/${photoId}/sections`);
      const data = await res.json();
      setSections(data.sections || []);
    } catch (e) {
      console.error('Failed to fetch sections:', e);
    } finally {
      setLoading(false);
    }
  }, [photoId]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  // ----------------------------------------
  // Image measurement
  // ----------------------------------------

  const measureImage = useCallback(() => {
    if (imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      setDisplaySize({ width: rect.width, height: rect.height });
      setNaturalSize({
        width: imgRef.current.naturalWidth,
        height: imgRef.current.naturalHeight,
      });
    }
  }, []);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    setImageError(false);
    measureImage();
  }, [measureImage]);

  const handleImageError = useCallback(() => {
    setImageError(true);
    setImageLoaded(false);
  }, []);

  useEffect(() => {
    if (!imageLoaded) return;
    const handleResize = () => measureImage();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [imageLoaded, measureImage]);

  useEffect(() => {
    if (!imageLoaded || !imgRef.current) return;
    const observer = new ResizeObserver(() => measureImage());
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [imageLoaded, measureImage]);

  // ----------------------------------------
  // Drawing handlers
  // ----------------------------------------

  const getRelativeCoords = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (drawState.mode === 'assigning') return; // Don't start drawing while assigning type
    const coords = getRelativeCoords(e);
    if (!coords) return;

    // Check if clicking an existing section first
    if (displaySize) {
      for (let i = sections.length - 1; i >= 0; i--) {
        const sec = sections[i];
        const left = sec.bbox_x0 * scaleX;
        const top = sec.bbox_y0 * scaleY;
        const right = sec.bbox_x1 * scaleX;
        const bottom = sec.bbox_y1 * scaleY;
        if (coords.x >= left && coords.x <= right && coords.y >= top && coords.y <= bottom) {
          setSelectedIndex(i);
          return;
        }
      }
    }

    // Start drawing a new section
    setSelectedIndex(null);
    setDrawState({
      mode: 'drawing',
      startX: coords.x,
      startY: coords.y,
      currentX: coords.x,
      currentY: coords.y,
    });
  }, [drawState.mode, getRelativeCoords, displaySize, sections, scaleX, scaleY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (drawState.mode !== 'drawing') return;
    const coords = getRelativeCoords(e);
    if (!coords) return;

    setDrawState(prev => {
      if (prev.mode !== 'drawing') return prev;
      return { ...prev, currentX: coords.x, currentY: coords.y };
    });
  }, [drawState.mode, getRelativeCoords]);

  const handleMouseUp = useCallback(() => {
    if (drawState.mode !== 'drawing') return;

    const minSize = 20; // Minimum 20px drawn rect to count
    const width = Math.abs(drawState.currentX - drawState.startX);
    const height = Math.abs(drawState.currentY - drawState.startY);

    if (width < minSize || height < minSize) {
      // Too small, cancel
      setDrawState({ mode: 'idle' });
      return;
    }

    // Convert display coords to source (OCR) coords
    const x0 = Math.round(Math.min(drawState.startX, drawState.currentX) / scaleX);
    const y0 = Math.round(Math.min(drawState.startY, drawState.currentY) / scaleY);
    const x1 = Math.round(Math.max(drawState.startX, drawState.currentX) / scaleX);
    const y1 = Math.round(Math.max(drawState.startY, drawState.currentY) / scaleY);

    setDrawState({
      mode: 'assigning',
      bbox: { x0, y0, x1, y1 },
    });
  }, [drawState, scaleX, scaleY]);

  // ----------------------------------------
  // Section CRUD
  // ----------------------------------------

  const handleAssignType = useCallback(async (sectionType: string) => {
    if (drawState.mode !== 'assigning') return;
    setSaving(true);

    const newSection: MenuSection = {
      section_type: sectionType,
      bbox_x0: drawState.bbox.x0,
      bbox_y0: drawState.bbox.y0,
      bbox_x1: drawState.bbox.x1,
      bbox_y1: drawState.bbox.y1,
    };

    try {
      const res = await fetch(`/api/photos/${photoId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSection),
      });
      const data = await res.json();
      if (data.section) {
        setSections(prev => [...prev, data.section]);
        setSelectedIndex(sections.length); // Select the new one
      }
    } catch (e) {
      console.error('Failed to create section:', e);
    } finally {
      setSaving(false);
      setDrawState({ mode: 'idle' });
    }
  }, [drawState, photoId, sections.length]);

  const handleCancelAssign = useCallback(() => {
    setDrawState({ mode: 'idle' });
  }, []);

  const handleDeleteSection = useCallback(async () => {
    if (selectedIndex === null) return;
    const section = sections[selectedIndex];
    if (!section?.id) return;

    setSaving(true);
    try {
      await fetch(`/api/photos/${photoId}/sections`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: section.id }),
      });
      setSections(prev => prev.filter((_, i) => i !== selectedIndex));
      setSelectedIndex(null);
    } catch (e) {
      console.error('Failed to delete section:', e);
    } finally {
      setSaving(false);
    }
  }, [selectedIndex, sections, photoId]);

  const handleChangeSectionType = useCallback(async (newType: string) => {
    if (selectedIndex === null) return;
    const section = sections[selectedIndex];
    if (!section?.id) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/photos/${photoId}/sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: section.id, section_type: newType }),
      });
      const data = await res.json();
      if (data.section) {
        setSections(prev => prev.map((s, i) => i === selectedIndex ? data.section : s));
      }
    } catch (e) {
      console.error('Failed to update section:', e);
    } finally {
      setSaving(false);
    }
  }, [selectedIndex, sections, photoId]);

  // Keyboard handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIndex !== null && drawState.mode === 'idle') {
          e.preventDefault();
          handleDeleteSection();
        }
      }
      if (e.key === 'Escape') {
        if (drawState.mode === 'assigning') {
          handleCancelAssign();
        } else {
          setSelectedIndex(null);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedIndex, drawState.mode, handleDeleteSection, handleCancelAssign]);

  // ----------------------------------------
  // Render
  // ----------------------------------------

  if (imageError) {
    return (
      <div style={styles.container}>
        <div style={styles.errorWrapper}>
          <span style={{ color: '#991b1b', fontSize: '14px' }}>Failed to load image</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container} ref={containerRef}>
      {/* Instructions */}
      <div style={styles.instructions}>
        {drawState.mode === 'assigning'
          ? 'Select a section type for the drawn region:'
          : drawState.mode === 'drawing'
          ? 'Release to finish drawing...'
          : 'Click and drag on the photo to draw a section. Click a section to select it.'}
      </div>

      {/* Image with overlay */}
      <div style={styles.imageContainer}>
        <div
          style={styles.imageWrapper}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <img
            ref={imgRef}
            src={photoUrl}
            alt="Menu photo"
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{
              ...styles.image,
              cursor: drawState.mode === 'assigning' ? 'default' : 'crosshair',
            }}
            draggable={false}
          />

          {/* Existing sections overlay */}
          {imageLoaded && displaySize && sections.map((sec, i) => {
            const color = getSectionColor(sec.section_type);
            const isSelected = selectedIndex === i;
            return (
              <div
                key={sec.id || i}
                style={{
                  position: 'absolute',
                  left: `${sec.bbox_x0 * scaleX}px`,
                  top: `${sec.bbox_y0 * scaleY}px`,
                  width: `${(sec.bbox_x1 - sec.bbox_x0) * scaleX}px`,
                  height: `${(sec.bbox_y1 - sec.bbox_y0) * scaleY}px`,
                  backgroundColor: `${color}20`,
                  border: `2px ${isSelected ? 'solid' : 'dashed'} ${color}`,
                  borderRadius: '4px',
                  boxSizing: 'border-box',
                  zIndex: isSelected ? 20 : 10,
                  pointerEvents: 'none',
                }}
              >
                {/* Label badge at top-left */}
                <div style={{
                  position: 'absolute',
                  top: '-1px',
                  left: '-1px',
                  background: color,
                  color: 'white',
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '0 0 4px 0',
                  whiteSpace: 'nowrap',
                  lineHeight: '16px',
                }}>
                  {getSectionLabel(sec.section_type)}
                </div>
              </div>
            );
          })}

          {/* Active drawing rect */}
          {drawState.mode === 'drawing' && (
            <div
              style={{
                position: 'absolute',
                left: `${Math.min(drawState.startX, drawState.currentX)}px`,
                top: `${Math.min(drawState.startY, drawState.currentY)}px`,
                width: `${Math.abs(drawState.currentX - drawState.startX)}px`,
                height: `${Math.abs(drawState.currentY - drawState.startY)}px`,
                border: `2px dashed ${BRAND.primary}`,
                backgroundColor: `${BRAND.primary}15`,
                borderRadius: '4px',
                pointerEvents: 'none',
                zIndex: 30,
                boxSizing: 'border-box',
              }}
            />
          )}

          {/* Loading overlay while image loads */}
          {!imageLoaded && !imageError && (
            <div style={styles.loadingOverlay}>
              <div style={styles.spinner} />
              <span style={{ color: '#64748b', fontSize: '13px' }}>Loading image...</span>
            </div>
          )}
        </div>
      </div>

      {/* Section type selector (shown after drawing) */}
      {drawState.mode === 'assigning' && (
        <div style={styles.typeSelector}>
          <div style={styles.typeSelectorLabel}>Choose section type:</div>
          <div style={styles.typeGrid}>
            {SECTION_TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => handleAssignType(t.value)}
                disabled={saving}
                style={{
                  ...styles.typeButton,
                  borderColor: t.color,
                  color: t.color,
                }}
              >
                <span style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  background: t.color,
                  marginRight: '6px',
                  flexShrink: 0,
                }} />
                {t.label}
              </button>
            ))}
          </div>
          <button onClick={handleCancelAssign} style={styles.cancelButton}>
            Cancel
          </button>
        </div>
      )}

      {/* Selected section controls */}
      {selectedIndex !== null && drawState.mode === 'idle' && sections[selectedIndex] && (
        <div style={styles.selectedControls}>
          <span style={styles.selectedLabel}>
            Selected: <strong>{getSectionLabel(sections[selectedIndex].section_type)}</strong>
          </span>
          <select
            value={sections[selectedIndex].section_type}
            onChange={(e) => handleChangeSectionType(e.target.value)}
            disabled={saving}
            style={styles.typeSelect}
          >
            {SECTION_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button
            onClick={handleDeleteSection}
            disabled={saving}
            style={styles.deleteButton}
          >
            Delete
          </button>
        </div>
      )}

      {/* Section list summary */}
      {sections.length > 0 && (
        <div style={styles.sectionList}>
          <div style={styles.sectionListHeader}>
            Sections ({sections.length})
          </div>
          {sections.map((sec, i) => {
            const color = getSectionColor(sec.section_type);
            const isSelected = selectedIndex === i;
            return (
              <div
                key={sec.id || i}
                onClick={() => setSelectedIndex(i)}
                style={{
                  ...styles.sectionListItem,
                  borderLeft: `3px solid ${color}`,
                  background: isSelected ? BRAND.primaryLight : 'white',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>
                  {getSectionLabel(sec.section_type)}
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {sec.bbox_x1 - sec.bbox_x0} x {sec.bbox_y1 - sec.bbox_y0}px
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Loading state for initial data */}
      {loading && (
        <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
          Loading sections...
        </div>
      )}
    </div>
  );
}

// ============================================
// Styles
// ============================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
  },
  instructions: {
    fontSize: '13px',
    color: '#64748b',
    padding: '8px 12px',
    background: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  imageContainer: {
    width: '100%',
    overflow: 'auto',
  },
  imageWrapper: {
    position: 'relative',
    display: 'inline-block',
    lineHeight: 0,
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #e0e0e0',
    userSelect: 'none',
  },
  image: {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    userSelect: 'none',
  },
  loadingOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    background: '#f5f5f5',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e2e8f0',
    borderTop: `3px solid ${BRAND.primary}`,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  errorWrapper: {
    padding: '40px',
    textAlign: 'center',
    background: '#fef2f2',
    borderRadius: '8px',
    border: '1px solid #fecaca',
  },
  typeSelector: {
    padding: '16px',
    background: 'white',
    borderRadius: '12px',
    border: `2px solid ${BRAND.primary}`,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  typeSelectorLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '12px',
  },
  typeGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '12px',
  },
  typeButton: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 14px',
    borderRadius: '8px',
    border: '2px solid',
    background: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'all 0.15s',
  },
  cancelButton: {
    padding: '6px 16px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    background: '#f8fafc',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  selectedControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: 'white',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    flexWrap: 'wrap',
  },
  selectedLabel: {
    fontSize: '13px',
    color: '#475569',
  },
  typeSelect: {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '13px',
    background: 'white',
    color: '#1e293b',
  },
  deleteButton: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid #fca5a5',
    background: '#fef2f2',
    color: '#dc2626',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    marginLeft: 'auto',
  },
  sectionList: {
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  sectionListHeader: {
    padding: '10px 14px',
    background: '#f8fafc',
    fontSize: '13px',
    fontWeight: 600,
    color: '#475569',
    borderBottom: '1px solid #e2e8f0',
  },
  sectionListItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 14px',
    borderBottom: '1px solid #f1f5f9',
    transition: 'background 0.1s',
  },
};
