/**
 * OCR Photo Overlay Component
 * Renders a photo with semi-transparent bounding box rectangles overlaid on
 * corrected words. Supports click selection, hover tooltips, and zoom/pan.
 *
 * Zoom/Pan:
 * - Mouse wheel zooms in/out (0.25x steps, clamped 1x–5x)
 * - Click-and-drag pans when zoomed > 1x
 * - Double-click resets zoom to 1x fit
 * - Zoom controls bar: [−] [100%] [+] [Fit]
 * - Touch: pinch-to-zoom support
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// Brand colors
const brandColors = {
  primary: '#0d7377',
  accent: '#22d3e6',
};

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 0.25;

export interface WordData {
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

interface OCRPhotoOverlayProps {
  photoUrl: string;
  words: WordData[];
  selectedWordIndex: number | null;
  ocrImageWidth: number | null;
  ocrImageHeight: number | null;
  onWordSelect: (wordIndex: number | null) => void;
  zoomToWordIndex?: number | null;
  zoomToSeq?: number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  word: WordData | null;
}

/**
 * Returns the overlay style for a word based on its correction source and
 * whether it is currently selected.
 */
function getWordOverlayStyle(
  word: WordData,
  isSelected: boolean
): { background: string; border: string } {
  // Selected word: light accent border, same thickness as low-conf (1px)
  if (isSelected) {
    return {
      background: 'rgba(34, 211, 230, 0.15)',
      border: `1px solid ${brandColors.accent}`,
    };
  }

  // Low confidence words get a red tint regardless of correction status
  if (word.confidence < 60) {
    return {
      background: 'rgba(239, 68, 68, 0.15)',
      border: '1px solid rgba(239, 68, 68, 0.4)',
    };
  }

  // Non-corrected words: invisible overlay
  if (!word.was_corrected) {
    return {
      background: 'transparent',
      border: '1px solid transparent',
    };
  }

  // Corrected words: color by source
  switch (word.correction_source) {
    case 'dictionary':
      return {
        background: 'rgba(255, 200, 0, 0.25)',
        border: '1px solid rgba(255, 200, 0, 0.6)',
      };
    case 'learned':
      return {
        background: 'rgba(34, 211, 230, 0.25)',
        border: '1px solid rgba(34, 211, 230, 0.6)',
      };
    case 'user':
      return {
        background: 'rgba(34, 197, 94, 0.25)',
        border: '1px solid rgba(34, 197, 94, 0.6)',
      };
    default:
      return {
        background: 'rgba(200, 200, 200, 0.2)',
        border: '1px solid rgba(200, 200, 200, 0.5)',
      };
  }
}

export default function OCRPhotoOverlay(props: OCRPhotoOverlayProps) {
  const {
    photoUrl,
    words,
    selectedWordIndex,
    ocrImageWidth,
    ocrImageHeight,
    onWordSelect,
    zoomToWordIndex,
    zoomToSeq,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    word: null,
  });

  // Zoom/pan state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const didDragRef = useRef(false);

  // Touch zoom state
  const lastTouchDistRef = useRef<number | null>(null);
  const lastTouchZoomRef = useRef<number>(1);

  // Reset all state when the photo changes (switching to next photo in queue)
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
    setDisplaySize(null);
    setNaturalSize(null);
    setZoomLevel(1);
    setPanX(0);
    setPanY(0);
    setTooltip({ visible: false, x: 0, y: 0, word: null });
  }, [photoUrl]);

  // Clamp pan so the image doesn't go out of view
  const clampPan = useCallback((px: number, py: number, zoom: number): { x: number; y: number } => {
    if (!displaySize || zoom <= 1) return { x: 0, y: 0 };
    const maxPanX = displaySize.width * (zoom - 1);
    const maxPanY = displaySize.height * (zoom - 1);
    return {
      x: Math.max(-maxPanX, Math.min(0, px)),
      y: Math.max(-maxPanY, Math.min(0, py)),
    };
  }, [displaySize]);

  // Compute the scale factor from OCR coordinate space to displayed image space
  const getScaleFactor = useCallback((): { scaleX: number; scaleY: number } | null => {
    if (!displaySize) return null;

    // Use ocrImageWidth/Height if provided, otherwise fall back to naturalWidth/Height
    const sourceWidth = ocrImageWidth ?? naturalSize?.width ?? null;
    const sourceHeight = ocrImageHeight ?? naturalSize?.height ?? null;

    if (!sourceWidth || !sourceHeight) return null;
    if (sourceWidth === 0 || sourceHeight === 0) return null;

    return {
      scaleX: displaySize.width / sourceWidth,
      scaleY: displaySize.height / sourceHeight,
    };
  }, [displaySize, ocrImageWidth, ocrImageHeight, naturalSize]);

  // Measure the displayed image dimensions after load
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

  // Re-measure on window resize so overlays stay aligned
  useEffect(() => {
    if (!imageLoaded) return;

    const handleResize = () => {
      measureImage();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [imageLoaded, measureImage]);

  // Also re-measure with ResizeObserver for container size changes
  useEffect(() => {
    if (!imageLoaded || !imgRef.current) return;

    const observer = new ResizeObserver(() => {
      measureImage();
    });

    observer.observe(imgRef.current);
    return () => {
      observer.disconnect();
    };
  }, [imageLoaded, measureImage]);

  // ---- Zoom to word when requested ----
  useEffect(() => {
    if (zoomToWordIndex === null || zoomToWordIndex === undefined) return;
    if (!displaySize) return;

    const word = words.find(w => w.word_index === zoomToWordIndex);
    if (!word) return;

    // Compute scale factor inline to avoid stale closure
    const sourceWidth = ocrImageWidth ?? naturalSize?.width ?? null;
    const sourceHeight = ocrImageHeight ?? naturalSize?.height ?? null;
    if (!sourceWidth || !sourceHeight) return;
    const scaleX = displaySize.width / sourceWidth;
    const scaleY = displaySize.height / sourceHeight;

    // Compute word center in display coordinates
    const wordCenterX = ((word.bbox_x0 + word.bbox_x1) / 2) * scaleX;
    const wordCenterY = ((word.bbox_y0 + word.bbox_y1) / 2) * scaleY;

    // Zoom to 3x
    const targetZoom = 3;

    // Pan so the word center is in the middle of the wrapper
    const wrapperEl = wrapperRef.current;
    const wrapperW = wrapperEl?.clientWidth ?? displaySize.width;
    const wrapperH = wrapperEl?.clientHeight ?? displaySize.height;

    const rawPanX = (wrapperW / 2) - (wordCenterX * targetZoom);
    const rawPanY = (wrapperH / 2) - (wordCenterY * targetZoom);

    // Clamp inline
    const maxPanX = displaySize.width * (targetZoom - 1);
    const maxPanY = displaySize.height * (targetZoom - 1);
    const clampedX = Math.max(-maxPanX, Math.min(0, rawPanX));
    const clampedY = Math.max(-maxPanY, Math.min(0, rawPanY));

    setZoomLevel(targetZoom);
    setPanX(clampedX);
    setPanY(clampedY);
  }, [zoomToWordIndex, zoomToSeq, displaySize, words, ocrImageWidth, ocrImageHeight, naturalSize]);

  // ---- Zoom handlers ----

  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(ZOOM_MAX, prev + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => {
      const next = Math.max(ZOOM_MIN, prev - ZOOM_STEP);
      if (next <= 1) {
        setPanX(0);
        setPanY(0);
      }
      return next;
    });
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomLevel(1);
    setPanX(0);
    setPanY(0);
  }, []);

  // ---- Pan handlers (mouse) ----

  const handlePanMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoomLevel <= 1) return;
      // Only initiate pan on left click
      if (e.button !== 0) return;
      panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      didDragRef.current = false;
      setIsPanning(true);
    },
    [zoomLevel, panX, panY]
  );

  const handlePanMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        didDragRef.current = true;
      }
      const newPan = clampPan(
        panStartRef.current.panX + dx,
        panStartRef.current.panY + dy,
        zoomLevel
      );
      setPanX(newPan.x);
      setPanY(newPan.y);
    },
    [isPanning, zoomLevel, clampPan]
  );

  const handlePanMouseUp = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // ---- Touch handlers (pinch-to-zoom) ----

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDistRef.current = Math.hypot(dx, dy);
        lastTouchZoomRef.current = zoomLevel;
      } else if (e.touches.length === 1 && zoomLevel > 1) {
        panStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          panX,
          panY,
        };
        didDragRef.current = false;
        setIsPanning(true);
      }
    },
    [zoomLevel, panX, panY]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && lastTouchDistRef.current !== null) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const scale = dist / lastTouchDistRef.current;
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, lastTouchZoomRef.current * scale));
        setZoomLevel(newZoom);
        if (newZoom <= 1) {
          setPanX(0);
          setPanY(0);
        }
      } else if (e.touches.length === 1 && isPanning && panStartRef.current) {
        const tdx = e.touches[0].clientX - panStartRef.current.x;
        const tdy = e.touches[0].clientY - panStartRef.current.y;
        if (Math.abs(tdx) > 3 || Math.abs(tdy) > 3) {
          didDragRef.current = true;
        }
        const newPan = clampPan(
          panStartRef.current.panX + tdx,
          panStartRef.current.panY + tdy,
          zoomLevel
        );
        setPanX(newPan.x);
        setPanY(newPan.y);
      }
    },
    [isPanning, zoomLevel, clampPan]
  );

  const handleTouchEnd = useCallback(() => {
    lastTouchDistRef.current = null;
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // ---- Word click/hover handlers ----

  const handleWordClick = useCallback(
    (e: React.MouseEvent, wordIndex: number) => {
      // If we were dragging, don't treat as a click
      if (didDragRef.current) return;
      e.stopPropagation();
      onWordSelect(wordIndex);
    },
    [onWordSelect]
  );

  const handleContainerClick = useCallback(() => {
    // If we were dragging, don't deselect
    if (didDragRef.current) return;
    // Clicking outside any word bbox deselects
    onWordSelect(null);
  }, [onWordSelect]);

  const handleDoubleClick = useCallback(() => {
    // Double-click resets zoom to fit
    setZoomLevel(1);
    setPanX(0);
    setPanY(0);
  }, []);

  const handleWordMouseEnter = useCallback(
    (e: React.MouseEvent, word: WordData) => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      // Position tooltip relative to the container
      const x = e.clientX - containerRect.left;
      const y = e.clientY - containerRect.top;

      setTooltip({
        visible: true,
        x,
        y,
        word,
      });
    },
    []
  );

  const handleWordMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!tooltip.visible) return;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      setTooltip((prev) => ({
        ...prev,
        x: e.clientX - containerRect.left,
        y: e.clientY - containerRect.top,
      }));
    },
    [tooltip.visible]
  );

  const handleWordMouseLeave = useCallback(() => {
    setTooltip({ visible: false, x: 0, y: 0, word: null });
  }, []);

  const scaleFactor = getScaleFactor();

  // Render loading state
  if (!imageLoaded && !imageError) {
    return (
      <div style={styles.container} ref={containerRef}>
        <div style={styles.loadingWrapper}>
          <img
            ref={imgRef}
            src={photoUrl}
            alt="OCR source"
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={styles.hiddenImage}
          />
          <div style={styles.loadingSpinner}>
            <div style={styles.spinnerDot} />
            <span style={styles.loadingText}>Loading image...</span>
          </div>
        </div>
      </div>
    );
  }

  // Render error state
  if (imageError) {
    return (
      <div style={styles.container} ref={containerRef}>
        <div style={styles.errorWrapper}>
          <span style={styles.errorIcon}>!</span>
          <span style={styles.errorText}>Failed to load image</span>
        </div>
      </div>
    );
  }

  const zoomPercent = `${Math.round(zoomLevel * 100)}%`;
  const isZoomed = zoomLevel > 1;

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onClick={handleContainerClick}
    >
      {/* The photo with zoom/pan */}
      <div
        ref={wrapperRef}
        style={{
          ...styles.imageWrapper,
          cursor: isPanning ? 'grabbing' : isZoomed ? 'grab' : 'default',
        }}
        onMouseDown={handlePanMouseDown}
        onMouseMove={handlePanMouseMove}
        onMouseUp={handlePanMouseUp}
        onMouseLeave={handlePanMouseUp}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Transform container for zoom+pan — image and overlays are children */}
        <div
          style={{
            transform: `scale(${zoomLevel}) translate(${panX / zoomLevel}px, ${panY / zoomLevel}px)`,
            transformOrigin: '0 0',
            transition: isPanning ? 'none' : 'transform 0.15s ease-out',
          }}
        >
          <img
            ref={imgRef}
            src={photoUrl}
            alt="OCR source"
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={styles.image}
            draggable={false}
          />

          {/* Overlay layer - only render when we can compute positions */}
          {scaleFactor && words.length > 0 && displaySize && (
            <div
              style={{
                ...styles.overlayLayer,
                width: displaySize.width,
                height: displaySize.height,
              }}
            >
              {words.map((word) => {
                const isSelected = selectedWordIndex === word.word_index;
                const overlayStyle = getWordOverlayStyle(word, isSelected);

                let left = word.bbox_x0 * scaleFactor.scaleX;
                let top = word.bbox_y0 * scaleFactor.scaleY;
                let width = (word.bbox_x1 - word.bbox_x0) * scaleFactor.scaleX;
                let height = (word.bbox_y1 - word.bbox_y0) * scaleFactor.scaleY;

                // Skip rendering words with zero or negative dimensions
                if (width <= 0 || height <= 0) return null;

                // Expand selected box by 35% so it frames the text
                if (isSelected) {
                  const expandW = width * 0.175;
                  const expandH = height * 0.175;
                  left -= expandW;
                  top -= expandH;
                  width += expandW * 2;
                  height += expandH * 2;
                }

                // Non-corrected, non-selected, high-confidence words are fully invisible
                // but we still render them so they can be clicked / hovered
                const isInvisible =
                  !word.was_corrected && !isSelected && word.confidence >= 60;

                return (
                  <div
                    key={word.word_index}
                    onClick={(e) => handleWordClick(e, word.word_index)}
                    onMouseEnter={(e) => handleWordMouseEnter(e, word)}
                    onMouseMove={handleWordMouseMove}
                    onMouseLeave={handleWordMouseLeave}
                    style={{
                      position: 'absolute',
                      left: `${left}px`,
                      top: `${top}px`,
                      width: `${width}px`,
                      height: `${height}px`,
                      backgroundColor: overlayStyle.background,
                      border: overlayStyle.border,
                      borderRadius: '2px',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s, border-color 0.15s',
                      zIndex: isSelected ? 10 : isInvisible ? 1 : 5,
                      boxSizing: 'border-box',
                      // Ensure invisible overlays still capture pointer events
                      pointerEvents: 'auto',
                    }}
                    title="" // Suppress default title tooltip; we use custom
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Custom tooltip - outside transform so it's not zoomed */}
        {tooltip.visible && tooltip.word && (
          <div
            style={{
              ...styles.tooltip,
              left: `${tooltip.x + 12}px`,
              top: `${tooltip.y - 10}px`,
            }}
          >
            <div style={styles.tooltipRow}>
              <span style={styles.tooltipLabel}>Raw:</span>
              <span style={styles.tooltipValue}>{tooltip.word.raw_text}</span>
            </div>
            <div style={styles.tooltipRow}>
              <span style={styles.tooltipLabel}>Corrected:</span>
              <span style={styles.tooltipValueBold}>{tooltip.word.corrected_text}</span>
            </div>
            <div style={styles.tooltipRow}>
              <span style={styles.tooltipLabel}>Confidence:</span>
              <span
                style={{
                  ...styles.tooltipValue,
                  color:
                    tooltip.word.confidence >= 80
                      ? '#4ade80'
                      : tooltip.word.confidence >= 60
                      ? '#facc15'
                      : '#f87171',
                }}
              >
                {tooltip.word.confidence.toFixed(1)}%
              </span>
            </div>
            {tooltip.word.was_corrected && tooltip.word.correction_source && (
              <div style={styles.tooltipRow}>
                <span style={styles.tooltipLabel}>Source:</span>
                <span style={styles.tooltipValue}>{tooltip.word.correction_source}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      {words.length > 0 && (
        <div style={styles.legend}>
          <div style={styles.legendItem}>
            <span
              style={{
                ...styles.legendSwatch,
                backgroundColor: 'rgba(255, 200, 0, 0.4)',
                border: '1px solid rgba(255, 200, 0, 0.8)',
              }}
            />
            <span style={styles.legendLabel}>Dictionary</span>
          </div>
          <div style={styles.legendItem}>
            <span
              style={{
                ...styles.legendSwatch,
                backgroundColor: 'rgba(34, 211, 230, 0.4)',
                border: '1px solid rgba(34, 211, 230, 0.8)',
              }}
            />
            <span style={styles.legendLabel}>Learned</span>
          </div>
          <div style={styles.legendItem}>
            <span
              style={{
                ...styles.legendSwatch,
                backgroundColor: 'rgba(34, 197, 94, 0.4)',
                border: '1px solid rgba(34, 197, 94, 0.8)',
              }}
            />
            <span style={styles.legendLabel}>User</span>
          </div>
          <div style={styles.legendItem}>
            <span
              style={{
                ...styles.legendSwatch,
                backgroundColor: 'rgba(239, 68, 68, 0.25)',
                border: '1px solid rgba(239, 68, 68, 0.6)',
              }}
            />
            <span style={styles.legendLabel}>Low conf.</span>
          </div>
        </div>
      )}

      {/* Zoom controls bar */}
      <div style={styles.zoomBar}>
        <button
          onClick={handleZoomOut}
          disabled={zoomLevel <= ZOOM_MIN}
          style={{
            ...styles.zoomButton,
            ...(zoomLevel <= ZOOM_MIN ? styles.zoomButtonDisabled : {}),
          }}
          title="Zoom out"
        >
          &minus;
        </button>
        <span style={styles.zoomLabel}>{zoomPercent}</span>
        <button
          onClick={handleZoomIn}
          disabled={zoomLevel >= ZOOM_MAX}
          style={{
            ...styles.zoomButton,
            ...(zoomLevel >= ZOOM_MAX ? styles.zoomButtonDisabled : {}),
          }}
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomReset}
          disabled={zoomLevel === 1}
          style={{
            ...styles.zoomButton,
            ...(zoomLevel === 1 ? styles.zoomButtonDisabled : {}),
            padding: '4px 10px',
          }}
          title="Reset to fit"
        >
          Fit
        </button>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
  loadingWrapper: {
    position: 'relative',
    width: '100%',
    minHeight: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
  },
  hiddenImage: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  loadingSpinner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  spinnerDot: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: `3px solid #e0e0e0`,
    borderTopColor: brandColors.primary,
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    color: '#888',
    fontSize: '14px',
  },
  errorWrapper: {
    width: '100%',
    minHeight: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    backgroundColor: '#fef2f2',
    borderRadius: '8px',
    border: '1px solid #fecaca',
  },
  errorIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#ef4444',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '18px',
  },
  errorText: {
    color: '#991b1b',
    fontSize: '14px',
    fontWeight: '500',
  },
  imageWrapper: {
    position: 'relative',
    display: 'inline-block',
    lineHeight: 0,
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #e0e0e0',
  },
  image: {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    userSelect: 'none',
  },
  overlayLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none',
  },
  tooltip: {
    position: 'absolute',
    zIndex: 100,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    color: '#e2e8f0',
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    lineHeight: '1.5',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    border: `1px solid ${brandColors.primary}`,
    maxWidth: '300px',
  },
  tooltipRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'baseline',
  },
  tooltipLabel: {
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: '500',
    minWidth: '70px',
  },
  tooltipValue: {
    fontSize: '12px',
    fontWeight: '400',
  },
  tooltipValueBold: {
    fontSize: '12px',
    fontWeight: '600',
    color: brandColors.accent,
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '8px 4px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  legendSwatch: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    borderRadius: '3px',
    flexShrink: 0,
  },
  legendLabel: {
    fontSize: '12px',
    color: '#666',
  },
  // Zoom controls
  zoomBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    background: '#f8fafc',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
    alignSelf: 'flex-start',
  },
  zoomButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: `1px solid ${brandColors.primary}`,
    background: 'white',
    color: brandColors.primary,
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '700',
    lineHeight: 1,
    padding: 0,
    transition: 'all 0.15s',
  },
  zoomButtonDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
    borderColor: '#cbd5e1',
    color: '#94a3b8',
  },
  zoomLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#475569',
    minWidth: '40px',
    textAlign: 'center',
  },
};
