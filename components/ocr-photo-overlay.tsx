/**
 * OCR Photo Overlay Component
 * Renders a photo with semi-transparent bounding box rectangles overlaid on
 * corrected words. Supports click selection and hover tooltips. Bbox colors
 * indicate correction source; the selected word gets a bright highlight.
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// Brand colors
const brandColors = {
  primary: '#0d7377',
  accent: '#22d3e6',
};

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
  // Selected word always gets the bright primary highlight
  if (isSelected) {
    // Determine base color from correction source, but bump opacity
    if (word.was_corrected) {
      switch (word.correction_source) {
        case 'dictionary':
          return {
            background: 'rgba(255, 200, 0, 0.45)',
            border: `2px solid ${brandColors.primary}`,
          };
        case 'learned':
          return {
            background: 'rgba(34, 211, 230, 0.45)',
            border: `2px solid ${brandColors.primary}`,
          };
        case 'user':
          return {
            background: 'rgba(34, 197, 94, 0.45)',
            border: `2px solid ${brandColors.primary}`,
          };
        default:
          return {
            background: 'rgba(13, 115, 119, 0.3)',
            border: `2px solid ${brandColors.primary}`,
          };
      }
    }
    // Non-corrected but selected
    return {
      background: 'rgba(13, 115, 119, 0.2)',
      border: `2px solid ${brandColors.primary}`,
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
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

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

  const handleWordClick = useCallback(
    (e: React.MouseEvent, wordIndex: number) => {
      e.stopPropagation();
      onWordSelect(wordIndex);
    },
    [onWordSelect]
  );

  const handleContainerClick = useCallback(() => {
    // Clicking outside any word bbox deselects
    onWordSelect(null);
  }, [onWordSelect]);

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

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onClick={handleContainerClick}
    >
      {/* The photo */}
      <div style={styles.imageWrapper}>
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

              const left = word.bbox_x0 * scaleFactor.scaleX;
              const top = word.bbox_y0 * scaleFactor.scaleY;
              const width = (word.bbox_x1 - word.bbox_x0) * scaleFactor.scaleX;
              const height = (word.bbox_y1 - word.bbox_y0) * scaleFactor.scaleY;

              // Skip rendering words with zero or negative dimensions
              if (width <= 0 || height <= 0) return null;

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

        {/* Custom tooltip */}
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
};
