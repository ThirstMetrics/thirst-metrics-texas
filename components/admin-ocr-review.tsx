/**
 * Admin OCR Review Component
 * Main OCR review page for the admin panel. Manages the photo queue, filters,
 * navigation, and contains the two sub-components (photo overlay and text editor)
 * in a side-by-side layout.
 *
 * Layout:
 * - Desktop: side-by-side (photo left, text editor right)
 * - Mobile (<768px): stacked vertically (photo top, text below)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '@/lib/hooks/use-media-query';
import OCRPhotoOverlay from './ocr-photo-overlay';
import OCRTextEditor from './ocr-text-editor';

// ============================================
// Types
// ============================================

interface QueuePhoto {
  id: string;
  photo_url: string;
  photo_type: string | null;
  ocr_text: string | null;
  ocr_raw_text: string | null;
  ocr_confidence: number | null;
  ocr_processing_time_ms: number | null;
  ocr_image_width: number | null;
  ocr_image_height: number | null;
  ocr_word_count: number | null;
  ocr_correction_count: number | null;
  ocr_review_status: string | null;
  ocr_processed_at: string | null;
  uploaded_at: string | null;
}

interface WordData {
  id: string;
  word_index: number;
  raw_text: string;
  corrected_text: string;
  confidence: number;
  bbox_x0: number;
  bbox_y0: number;
  bbox_x1: number;
  bbox_y1: number;
  line_index: number;
  block_index: number;
  was_corrected: boolean;
  correction_source: string | null;
  dictionary_key: string | null;
}

interface LearnedEntry {
  id: string;
  mistake_text: string;
  correction_text: string;
  confirmation_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// Constants
// ============================================

const BRAND = {
  primary: '#0d7377',
  primaryDark: '#042829',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
  hover: '#0a5f63',
};

type FilterKey = 'pending' | 'reviewed' | 'needs_review' | 'all';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'needs_review', label: 'Needs Review' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'all', label: 'All' },
];

// ============================================
// Helpers
// ============================================

const formatNumber = (v: number) =>
  new Intl.NumberFormat('en-US').format(v);

const formatConfidence = (v: number | null) => {
  if (v === null || v === undefined) return '--';
  return `${(v * 100).toFixed(1)}%`;
};

const formatMs = (v: number | null) => {
  if (v === null || v === undefined) return '--';
  if (v < 1000) return `${v}ms`;
  return `${(v / 1000).toFixed(1)}s`;
};

// ============================================
// Main Component
// ============================================

export default function AdminOCRReview() {
  const isMobile = useIsMobile();

  // State
  const [photos, setPhotos] = useState<QueuePhoto[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [words, setWords] = useState<WordData[]>([]);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterKey>('pending');
  const [loading, setLoading] = useState(true);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [learnedStats, setLearnedStats] = useState<{ total: number; active: number } | null>(null);
  const [learnedEntries, setLearnedEntries] = useState<LearnedEntry[]>([]);
  const [showLearnedDict, setShowLearnedDict] = useState(false);
  const [learnedLoading, setLearnedLoading] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const limit = 20;

  const currentPhoto = photos[currentIndex] || null;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // ----------------------------------------
  // Fetch: Photo queue
  // ----------------------------------------

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ocr/queue?status=${filter}&page=${page}&limit=${limit}`);
      const data = await res.json();
      setPhotos(data.photos || []);
      setTotal(data.total || 0);
      setCurrentIndex(0);
    } catch (e) {
      console.error('Failed to fetch OCR queue:', e);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  // ----------------------------------------
  // Fetch: Word data for current photo
  // ----------------------------------------

  const fetchWords = useCallback(async (photoId: string) => {
    setWordsLoading(true);
    try {
      const res = await fetch(`/api/admin/ocr/words/${photoId}`);
      const data = await res.json();
      setWords(data.words || []);
    } catch (e) {
      console.error('Failed to fetch word data:', e);
      setWords([]);
    } finally {
      setWordsLoading(false);
    }
  }, []);

  // ----------------------------------------
  // Fetch: Learned dictionary stats
  // ----------------------------------------

  const fetchLearnedData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ocr/learned');
      const data = await res.json();
      const entries: LearnedEntry[] = data.entries || [];
      setLearnedEntries(entries);
      setLearnedStats({
        total: entries.length,
        active: entries.filter(e => e.is_active).length,
      });
    } catch (e) {
      /* ignore */
    }
  }, []);

  const fetchLearnedEntries = useCallback(async () => {
    setLearnedLoading(true);
    try {
      const res = await fetch('/api/admin/ocr/learned');
      const data = await res.json();
      setLearnedEntries(data.entries || []);
    } catch (e) {
      console.error('Failed to fetch learned entries:', e);
    } finally {
      setLearnedLoading(false);
    }
  }, []);

  // ----------------------------------------
  // Effects
  // ----------------------------------------

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    fetchLearnedData();
  }, [fetchLearnedData]);

  useEffect(() => {
    if (currentPhoto?.id) {
      fetchWords(currentPhoto.id);
      setSelectedWordIndex(null);
    }
  }, [currentPhoto?.id, fetchWords]);

  // ----------------------------------------
  // Handlers
  // ----------------------------------------

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleNext = () => {
    if (currentIndex < photos.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const handleFilterChange = (newFilter: FilterKey) => {
    setFilter(newFilter);
    setPage(1);
  };

  const handlePagePrev = () => {
    if (page > 1) setPage(page - 1);
  };

  const handlePageNext = () => {
    if (page < totalPages) setPage(page + 1);
  };

  const handleWordSelect = (wordIndex: number | null) => {
    setSelectedWordIndex(wordIndex);
  };

  const handleCorrection = async (wordIndex: number, systemText: string, userText: string) => {
    if (!currentPhoto) return;
    try {
      const word = words.find(w => w.word_index === wordIndex);
      await fetch('/api/admin/ocr/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activityPhotoId: currentPhoto.id,
          wordIndex,
          systemText,
          userText,
          bbox: word ? { x0: word.bbox_x0, y0: word.bbox_y0, x1: word.bbox_x1, y1: word.bbox_y1 } : undefined,
        }),
      });
      // Update local word state
      setWords(prev => prev.map(w =>
        w.word_index === wordIndex
          ? { ...w, corrected_text: userText, was_corrected: true, correction_source: 'user' }
          : w
      ));
    } catch (e) {
      console.error('Failed to submit correction:', e);
    }
  };

  const handleMarkReviewed = async () => {
    if (!currentPhoto) return;
    setMarkingReviewed(true);
    try {
      await fetch(`/api/admin/ocr/review/${currentPhoto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewed' }),
      });
      // Move to next photo or refresh
      if (currentIndex < photos.length - 1) {
        setPhotos(prev => prev.filter((_, i) => i !== currentIndex));
      } else {
        fetchQueue();
      }
    } catch (e) {
      console.error('Failed to mark reviewed:', e);
    } finally {
      setMarkingReviewed(false);
    }
  };

  const handleReprocess = async () => {
    if (!currentPhoto) return;
    setReprocessing(true);
    try {
      await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoUrl: currentPhoto.photo_url,
          activityPhotoId: currentPhoto.id,
        }),
      });
      // Refresh word data and queue
      fetchWords(currentPhoto.id);
      fetchQueue();
    } catch (e) {
      console.error('Failed to reprocess:', e);
    } finally {
      setReprocessing(false);
    }
  };

  const handleApproveCorrections = async () => {
    // Find user corrections in current words and approve them into learned dictionary
    const userCorrected = words.filter(w => w.was_corrected && w.correction_source === 'user');
    if (userCorrected.length === 0) return;

    for (const w of userCorrected) {
      try {
        await fetch('/api/admin/ocr/learned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mistakeText: w.raw_text,
            correctionText: w.corrected_text,
          }),
        });
      } catch (e) {
        console.error('Failed to approve correction:', e);
      }
    }
    fetchLearnedData();
  };

  const handleToggleLearnedEntry = async (entry: LearnedEntry) => {
    try {
      // Toggle active status via the learned API
      await fetch('/api/admin/ocr/learned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mistakeText: entry.mistake_text,
          correctionText: entry.correction_text,
          isActive: !entry.is_active,
        }),
      });
      // Optimistic update
      setLearnedEntries(prev => prev.map(e =>
        e.id === entry.id ? { ...e, is_active: !e.is_active } : e
      ));
      fetchLearnedData();
    } catch (e) {
      console.error('Failed to toggle entry:', e);
    }
  };

  const handleShowLearnedDict = () => {
    if (!showLearnedDict) fetchLearnedEntries();
    setShowLearnedDict(!showLearnedDict);
  };

  // ----------------------------------------
  // Render: Loading state
  // ----------------------------------------

  if (loading) {
    return (
      <div style={s.loadingContainer}>
        <div style={s.spinner} />
        <span style={{ color: '#64748b', fontSize: '14px' }}>Loading OCR queue...</span>
      </div>
    );
  }

  // ----------------------------------------
  // Render: Empty state
  // ----------------------------------------

  if (photos.length === 0 && !loading) {
    return (
      <div style={s.container}>
        {/* Filter bar */}
        <div style={s.filterBar}>
          <span style={s.filterLabel}>Filter:</span>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => handleFilterChange(f.key)}
              style={{
                ...s.filterPill,
                ...(filter === f.key ? s.filterPillActive : {}),
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={s.emptyState}>
          <div style={s.emptyIcon}>&#128247;</div>
          <h3 style={s.emptyTitle}>No photos to review</h3>
          <p style={s.emptyText}>
            {filter === 'pending'
              ? 'All photos have been reviewed. Nice work!'
              : filter === 'needs_review'
              ? 'No photos currently flagged for review.'
              : filter === 'reviewed'
              ? 'No reviewed photos found.'
              : 'No photos found in the queue.'}
          </p>
        </div>

        {/* Bottom stats */}
        {learnedStats && (
          <div style={s.bottomBar}>
            <span style={s.bottomStat}>
              Learned Dictionary: {formatNumber(learnedStats.total)} entries | {formatNumber(learnedStats.active)} active
            </span>
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------
  // Render: Main review layout
  // ----------------------------------------

  return (
    <div style={s.container}>
      {/* ---- Header: Navigation + Filter ---- */}
      <div style={{
        ...s.header,
        ...(isMobile ? { flexDirection: 'column', gap: '12px' } : {}),
      }}>
        {/* Photo navigation */}
        <div style={s.navRow}>
          <span style={s.headerLabel}>Photo Queue:</span>
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            style={{
              ...s.navButton,
              ...(currentIndex === 0 ? s.navButtonDisabled : {}),
            }}
          >
            &larr; Prev
          </button>
          <span style={s.navCounter}>
            {currentIndex + 1} of {photos.length}
            {total > photos.length && (
              <span style={{ color: '#94a3b8' }}> ({formatNumber(total)} total)</span>
            )}
          </span>
          <button
            onClick={handleNext}
            disabled={currentIndex >= photos.length - 1}
            style={{
              ...s.navButton,
              ...(currentIndex >= photos.length - 1 ? s.navButtonDisabled : {}),
            }}
          >
            Next &rarr;
          </button>
        </div>

        {/* Filter pills + Reprocess button */}
        <div style={s.filterRow}>
          <span style={s.filterLabel}>Filter:</span>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => handleFilterChange(f.key)}
              style={{
                ...s.filterPill,
                ...(filter === f.key ? s.filterPillActive : {}),
                ...(isMobile ? { padding: '6px 12px', fontSize: '12px' } : {}),
              }}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={handleReprocess}
            disabled={reprocessing || !currentPhoto}
            style={{
              ...s.reprocessButton,
              ...(reprocessing ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
            }}
          >
            {reprocessing ? 'Reprocessing...' : 'Re-process'}
          </button>
        </div>
      </div>

      {/* ---- Pagination (if multiple pages) ---- */}
      {totalPages > 1 && (
        <div style={s.paginationRow}>
          <button
            onClick={handlePagePrev}
            disabled={page <= 1}
            style={{
              ...s.pageButton,
              ...(page <= 1 ? s.navButtonDisabled : {}),
            }}
          >
            &laquo; Prev Page
          </button>
          <span style={s.pageIndicator}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={handlePageNext}
            disabled={page >= totalPages}
            style={{
              ...s.pageButton,
              ...(page >= totalPages ? s.navButtonDisabled : {}),
            }}
          >
            Next Page &raquo;
          </button>
        </div>
      )}

      {/* ---- Main content: Photo + Text Editor ---- */}
      <div style={{
        ...s.mainContent,
        ...(isMobile
          ? { flexDirection: 'column' }
          : { flexDirection: 'row' }
        ),
      }}>
        {/* Left panel: Photo overlay */}
        <div style={{
          ...s.panelLeft,
          ...(isMobile ? { width: '100%', minHeight: '300px' } : {}),
        }}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Photo</span>
            {currentPhoto?.photo_type && (
              <span style={s.photoTypeBadge}>{currentPhoto.photo_type}</span>
            )}
          </div>
          <div style={s.panelBody}>
            {currentPhoto ? (
              <OCRPhotoOverlay
                photoUrl={currentPhoto.photo_url}
                words={words}
                selectedWordIndex={selectedWordIndex}
                onWordSelect={handleWordSelect}
                imageWidth={currentPhoto.ocr_image_width}
                imageHeight={currentPhoto.ocr_image_height}
                loading={wordsLoading}
              />
            ) : (
              <div style={s.panelPlaceholder}>No photo selected</div>
            )}
          </div>
        </div>

        {/* Right panel: Text editor */}
        <div style={{
          ...s.panelRight,
          ...(isMobile ? { width: '100%', minHeight: '300px' } : {}),
        }}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>OCR Text</span>
            {wordsLoading && <span style={s.wordsLoadingIndicator}>Loading...</span>}
          </div>
          <div style={s.panelBody}>
            {currentPhoto ? (
              <OCRTextEditor
                words={words}
                selectedWordIndex={selectedWordIndex}
                onWordSelect={handleWordSelect}
                onCorrection={handleCorrection}
                loading={wordsLoading}
              />
            ) : (
              <div style={s.panelPlaceholder}>No photo selected</div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Action bar: Mark Reviewed ---- */}
      <div style={s.actionBar}>
        <button
          onClick={handleMarkReviewed}
          disabled={markingReviewed || !currentPhoto}
          style={{
            ...s.markReviewedButton,
            ...(markingReviewed ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
          }}
        >
          {markingReviewed ? 'Marking...' : 'Mark Reviewed'}
        </button>

        {currentPhoto?.ocr_review_status && (
          <span style={s.statusBadge}>
            Status: {currentPhoto.ocr_review_status}
          </span>
        )}
      </div>

      {/* ---- Learned Dictionary section ---- */}
      <div style={s.learnedSection}>
        <div style={s.learnedHeader}>
          <button onClick={handleShowLearnedDict} style={s.learnedToggle}>
            <span style={{ transform: showLearnedDict ? 'rotate(90deg)' : 'rotate(0)', display: 'inline-block', transition: 'transform 0.2s' }}>&#9654;</span>
            {' '}Learned Dictionary
            {learnedStats && (
              <span style={s.learnedBadge}>
                {learnedStats.active} active / {learnedStats.total} total
              </span>
            )}
          </button>
          {words.some(w => w.was_corrected && w.correction_source === 'user') && (
            <button onClick={handleApproveCorrections} style={s.approveButton}>
              Approve User Corrections to Dictionary
            </button>
          )}
        </div>
        {showLearnedDict && (
          <div style={s.learnedBody}>
            {learnedLoading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
            ) : learnedEntries.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>No learned entries yet</div>
            ) : (
              <div style={s.learnedTable}>
                <div style={s.learnedTableHeader}>
                  <span style={{ flex: 1 }}>OCR Mistake</span>
                  <span style={{ flex: 1 }}>Correction</span>
                  <span style={{ width: '60px', textAlign: 'center' }}>Count</span>
                  <span style={{ width: '70px', textAlign: 'center' }}>Active</span>
                </div>
                {learnedEntries.map(entry => (
                  <div key={entry.id} style={{
                    ...s.learnedTableRow,
                    opacity: entry.is_active ? 1 : 0.5,
                  }}>
                    <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px' }}>{entry.mistake_text}</span>
                    <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px', color: BRAND.primary, fontWeight: 600 }}>{entry.correction_text}</span>
                    <span style={{ width: '60px', textAlign: 'center', fontSize: '13px' }}>{entry.confirmation_count}</span>
                    <span style={{ width: '70px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleToggleLearnedEntry(entry)}
                        style={{
                          padding: '2px 10px',
                          borderRadius: '10px',
                          border: 'none',
                          fontSize: '12px',
                          cursor: 'pointer',
                          background: entry.is_active ? '#dcfce7' : '#fee2e2',
                          color: entry.is_active ? '#166534' : '#991b1b',
                        }}
                      >
                        {entry.is_active ? 'On' : 'Off'}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Stats bar ---- */}
      <div style={{
        ...s.statsBar,
        ...(isMobile ? { flexDirection: 'column', gap: '8px' } : {}),
      }}>
        <div style={s.statsGroup}>
          <span style={s.statItem}>
            <span style={s.statLabel}>Confidence:</span>
            <span style={s.statValue}>{formatConfidence(currentPhoto?.ocr_confidence ?? null)}</span>
          </span>
          <span style={s.statDivider}>|</span>
          <span style={s.statItem}>
            <span style={s.statLabel}>Words:</span>
            <span style={s.statValue}>
              {currentPhoto?.ocr_word_count != null ? formatNumber(currentPhoto.ocr_word_count) : '--'}
            </span>
          </span>
          <span style={s.statDivider}>|</span>
          <span style={s.statItem}>
            <span style={s.statLabel}>Corrections:</span>
            <span style={s.statValue}>
              {currentPhoto?.ocr_correction_count != null ? formatNumber(currentPhoto.ocr_correction_count) : '--'}
            </span>
          </span>
          <span style={s.statDivider}>|</span>
          <span style={s.statItem}>
            <span style={s.statLabel}>Processing:</span>
            <span style={s.statValue}>{formatMs(currentPhoto?.ocr_processing_time_ms ?? null)}</span>
          </span>
        </div>

        {learnedStats && (
          <div style={s.learnedStatsGroup}>
            <span style={s.statItem}>
              <span style={s.statLabel}>Learned Dictionary:</span>
              <span style={s.statValue}>
                {formatNumber(learnedStats.total)} entries | {formatNumber(learnedStats.active)} active
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Styles
// ============================================

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  // ---- Loading ----
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #0d7377',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },

  // ---- Empty state ----
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1e293b',
    margin: '0 0 8px 0',
  },
  emptyText: {
    fontSize: '14px',
    color: '#64748b',
    margin: 0,
    textAlign: 'center',
    maxWidth: '400px',
  },

  // ---- Header ----
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '16px 20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  headerLabel: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
    marginRight: '8px',
  },

  // ---- Navigation ----
  navRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navButton: {
    padding: '6px 14px',
    borderRadius: '8px',
    border: `1px solid ${BRAND.primary}`,
    background: 'white',
    color: BRAND.primary,
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'all 0.15s',
  },
  navButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
    borderColor: '#cbd5e1',
    color: '#94a3b8',
  },
  navCounter: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
    minWidth: '60px',
    textAlign: 'center',
  },

  // ---- Filter bar ----
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    padding: '12px 20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  filterLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#64748b',
  },
  filterPill: {
    padding: '6px 16px',
    borderRadius: '20px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    background: BRAND.primaryLight,
    color: BRAND.primary,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  filterPillActive: {
    background: BRAND.primary,
    color: 'white',
  },
  reprocessButton: {
    padding: '6px 14px',
    borderRadius: '8px',
    border: `1px solid ${BRAND.accent}`,
    background: 'white',
    color: BRAND.primaryDark,
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    marginLeft: '4px',
    transition: 'all 0.15s',
  },

  // ---- Pagination ----
  paginationRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  pageButton: {
    padding: '6px 14px',
    borderRadius: '8px',
    border: `1px solid ${BRAND.primary}`,
    background: 'white',
    color: BRAND.primary,
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    transition: 'all 0.15s',
  },
  pageIndicator: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#64748b',
  },

  // ---- Main content: side-by-side panels ----
  mainContent: {
    display: 'flex',
    gap: '16px',
    minHeight: '450px',
  },
  panelLeft: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    overflow: 'hidden',
    minWidth: 0,
  },
  panelRight: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    overflow: 'hidden',
    minWidth: 0,
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #f1f5f9',
    flexShrink: 0,
  },
  panelTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1e293b',
  },
  panelBody: {
    flex: 1,
    overflow: 'auto',
    position: 'relative',
  },
  panelPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#94a3b8',
    fontSize: '14px',
  },
  photoTypeBadge: {
    fontSize: '11px',
    fontWeight: 600,
    color: BRAND.primary,
    background: BRAND.primaryLight,
    padding: '3px 10px',
    borderRadius: '12px',
    textTransform: 'capitalize',
  },
  wordsLoadingIndicator: {
    fontSize: '12px',
    color: '#94a3b8',
    fontStyle: 'italic',
  },

  // ---- Action bar ----
  actionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px 20px',
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  markReviewedButton: {
    padding: '10px 24px',
    borderRadius: '8px',
    border: 'none',
    background: BRAND.primary,
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    transition: 'all 0.15s',
  },
  statusBadge: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#64748b',
    background: '#f1f5f9',
    padding: '4px 12px',
    borderRadius: '8px',
  },

  // ---- Stats bar ----
  statsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '14px 20px',
    background: BRAND.primaryDark,
    borderRadius: '12px',
    color: 'white',
  },
  statsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  learnedStatsGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '13px',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontWeight: 500,
  },
  statValue: {
    color: 'white',
    fontWeight: 600,
  },
  statDivider: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: '13px',
    userSelect: 'none',
  },

  // ---- Bottom bar (for empty state) ----
  bottomBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 20px',
    background: BRAND.primaryDark,
    borderRadius: '12px',
    color: 'white',
  },
  bottomStat: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'rgba(255,255,255,0.85)',
  },

  // ---- Learned Dictionary section ----
  learnedSection: {
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  learnedHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#f8fafc',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  learnedToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
    color: '#334155',
  },
  learnedBadge: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#64748b',
    background: '#e2e8f0',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  approveButton: {
    padding: '6px 14px',
    borderRadius: '8px',
    border: `1px solid ${BRAND.primary}`,
    background: BRAND.primaryLight,
    color: BRAND.primary,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  learnedBody: {
    borderTop: '1px solid #e2e8f0',
    maxHeight: '300px',
    overflowY: 'auto' as const,
  },
  learnedTable: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  learnedTableHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: '#f1f5f9',
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  learnedTableRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderBottom: '1px solid #f1f5f9',
  },
};
