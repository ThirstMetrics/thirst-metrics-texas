/**
 * OCR Text Editor Component
 * Renders OCR text word-by-word as clickable spans with correction highlighting.
 *
 * Features:
 * - Words grouped by line_index and block_index
 * - Color-coded correction sources (dictionary, learned, user)
 * - Low confidence words highlighted in red
 * - Click to select → sticky action bar shows word info + Edit/Delete buttons
 * - Keyboard: Tab between reviewable words, Enter to edit, Escape to cancel,
 *   Delete/Backspace to delete
 * - Shift+click for multi-select range, Delete key removes range
 */

'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// Brand colors
const brandColors = {
  primary: '#0d7377',
  primaryLight: '#e6f5f5',
  accent: '#22d3e6',
};

// Correction source color mapping
const correctionColors: Record<string, { background: string; label: string }> = {
  dictionary: { background: '#fef3c7', label: 'Dictionary' },
  learned: { background: '#e0f7fa', label: 'Learned' },
  user: { background: '#dcfce7', label: 'User' },
};

export interface WordData {
  word_index: number;
  raw_text: string;
  corrected_text: string;
  confidence: number;
  line_index: number;
  block_index: number;
  was_corrected: boolean;
  correction_source: string | null;
}

interface OCRTextEditorProps {
  words: WordData[];
  selectedWordIndex: number | null;
  onWordSelect: (wordIndex: number | null) => void;
  onCorrection: (wordIndex: number, systemText: string, userText: string) => void;
  onConfirmWord?: (wordIndex: number) => void;
  onDeleteWords?: (wordIndices: number[]) => void;
  onWordDoubleClick?: (wordIndex: number) => void;
  selectedWordIndices?: Set<number>;
  onSelectedWordIndicesChange?: (indices: Set<number>) => void;
}

interface GroupedBlock {
  blockIndex: number;
  lines: GroupedLine[];
}

interface GroupedLine {
  lineIndex: number;
  words: WordData[];
}

function groupWords(words: WordData[]): GroupedBlock[] {
  const blockMap = new Map<number, Map<number, WordData[]>>();

  for (const word of words) {
    if (!blockMap.has(word.block_index)) {
      blockMap.set(word.block_index, new Map());
    }
    const lineMap = blockMap.get(word.block_index)!;
    if (!lineMap.has(word.line_index)) {
      lineMap.set(word.line_index, []);
    }
    lineMap.get(word.line_index)!.push(word);
  }

  const blocks: GroupedBlock[] = [];
  const sortedBlockKeys = Array.from(blockMap.keys()).sort((a, b) => a - b);

  for (const blockIndex of sortedBlockKeys) {
    const lineMap = blockMap.get(blockIndex)!;
    const lines: GroupedLine[] = [];
    const sortedLineKeys = Array.from(lineMap.keys()).sort((a, b) => a - b);

    for (const lineIndex of sortedLineKeys) {
      const lineWords = lineMap.get(lineIndex)!;
      lineWords.sort((a, b) => a.word_index - b.word_index);
      lines.push({ lineIndex, words: lineWords });
    }

    blocks.push({ blockIndex, lines });
  }

  return blocks;
}

export default function OCRTextEditor(props: OCRTextEditorProps) {
  const {
    words,
    selectedWordIndex,
    onWordSelect,
    onCorrection,
    onConfirmWord,
    onDeleteWords,
    onWordDoubleClick,
    selectedWordIndices: externalSelectedIndices,
    onSelectedWordIndicesChange,
  } = props;

  const [editingWordIndex, setEditingWordIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [internalMultiSelect, setInternalMultiSelect] = useState<Set<number>>(new Set());
  const actionBarEditRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

  // Use external multi-select state if provided, otherwise internal
  const selectedWordIndices = externalSelectedIndices ?? internalMultiSelect;
  const setSelectedWordIndices = onSelectedWordIndicesChange ?? setInternalMultiSelect;

  // Memoize grouped structure
  const blocks = useMemo(() => groupWords(words), [words]);

  // Collect reviewable word indices for Tab navigation:
  // corrected OR low confidence, but NOT already user-reviewed
  const reviewableIndices = useMemo(() => {
    return words
      .filter((w) => (w.was_corrected || w.confidence < 60) && w.correction_source !== 'user')
      .map((w) => w.word_index)
      .sort((a, b) => a - b);
  }, [words]);

  // All word indices sorted for Shift+click range selection
  const allWordIndices = useMemo(() => {
    return words.map(w => w.word_index).sort((a, b) => a - b);
  }, [words]);

  // The currently selected word object
  const selectedWord = useMemo(() => {
    if (selectedWordIndex === null) return null;
    return words.find(w => w.word_index === selectedWordIndex) ?? null;
  }, [words, selectedWordIndex]);

  // Stats
  const totalWords = words.length;
  const totalCorrections = words.filter((w) => w.was_corrected).length;
  const lowConfCount = words.filter((w) => w.confidence < 60).length;

  // Auto-focus action bar edit input when editing begins
  useEffect(() => {
    if (editingWordIndex !== null && actionBarEditRef.current) {
      actionBarEditRef.current.focus();
      actionBarEditRef.current.select();
    }
  }, [editingWordIndex]);

  // Start editing a word
  const startEditing = useCallback(
    (wordIndex: number) => {
      const word = words.find((w) => w.word_index === wordIndex);
      if (!word) return;
      setEditingWordIndex(wordIndex);
      setEditValue(word.corrected_text);
      onWordSelect(wordIndex);
    },
    [words, onWordSelect]
  );

  // Cancel editing
  const cancelEditing = useCallback(() => {
    setEditingWordIndex(null);
    setEditValue('');
    // Re-focus the container so keyboard nav keeps working
    containerRef.current?.focus();
  }, []);

  // Submit edit
  const submitEdit = useCallback(
    (wordIndex: number) => {
      const word = words.find((w) => w.word_index === wordIndex);
      if (!word) return;
      const trimmed = editValue.trim();
      if (trimmed && trimmed !== word.corrected_text) {
        onCorrection(wordIndex, word.corrected_text, trimmed);
      }
      setEditingWordIndex(null);
      setEditValue('');
      containerRef.current?.focus();
    },
    [words, editValue, onCorrection]
  );

  // Delete selected words, then advance to the next reviewable word
  const handleDelete = useCallback(() => {
    if (!onDeleteWords) return;
    const indicesToDelete: number[] = [];

    if (selectedWordIndices.size > 0) {
      indicesToDelete.push(...Array.from(selectedWordIndices));
    } else if (selectedWordIndex !== null) {
      indicesToDelete.push(selectedWordIndex);
    }

    if (indicesToDelete.length === 0) return;

    // Find the next reviewable word (not in the set being deleted)
    const deleteSet = new Set(indicesToDelete);
    const currentPos = selectedWordIndex !== null
      ? reviewableIndices.indexOf(selectedWordIndex) : -1;

    let nextIndex: number | null = null;
    // Search forward from current position
    for (let i = currentPos + 1; i < reviewableIndices.length; i++) {
      if (!deleteSet.has(reviewableIndices[i])) {
        nextIndex = reviewableIndices[i];
        break;
      }
    }
    // If nothing forward, search from the beginning
    if (nextIndex === null) {
      for (let i = 0; i < currentPos; i++) {
        if (!deleteSet.has(reviewableIndices[i])) {
          nextIndex = reviewableIndices[i];
          break;
        }
      }
    }

    onDeleteWords(indicesToDelete);
    setSelectedWordIndices(new Set());
    onWordSelect(nextIndex);

    // Scroll to the next word after React re-renders
    if (nextIndex !== null) {
      setTimeout(() => {
        wordRefs.current.get(nextIndex!)?.scrollIntoView({ block: 'nearest' });
      }, 50);
    }
  }, [onDeleteWords, selectedWordIndices, selectedWordIndex, setSelectedWordIndices, reviewableIndices, onWordSelect]);

  // Confirm a word as correct, then advance to next reviewable word
  const handleConfirm = useCallback(() => {
    if (!onConfirmWord || selectedWordIndex === null) return;

    // Find next reviewable word (excluding the one being confirmed)
    const currentPos = reviewableIndices.indexOf(selectedWordIndex);
    let nextIndex: number | null = null;
    for (let i = currentPos + 1; i < reviewableIndices.length; i++) {
      if (reviewableIndices[i] !== selectedWordIndex) {
        nextIndex = reviewableIndices[i];
        break;
      }
    }
    if (nextIndex === null) {
      for (let i = 0; i < currentPos; i++) {
        if (reviewableIndices[i] !== selectedWordIndex) {
          nextIndex = reviewableIndices[i];
          break;
        }
      }
    }

    onConfirmWord(selectedWordIndex);
    onWordSelect(nextIndex);

    if (nextIndex !== null) {
      setTimeout(() => {
        wordRefs.current.get(nextIndex!)?.scrollIntoView({ block: 'nearest' });
      }, 50);
    }
  }, [onConfirmWord, selectedWordIndex, reviewableIndices, onWordSelect]);

  // Handle Shift+click for range selection
  const handleWordClick = useCallback(
    (e: React.MouseEvent, wordIndex: number) => {
      e.stopPropagation();

      if (e.shiftKey && selectedWordIndex !== null) {
        // Range selection: from current selectedWordIndex to clicked word
        const startIdx = allWordIndices.indexOf(selectedWordIndex);
        const endIdx = allWordIndices.indexOf(wordIndex);
        if (startIdx !== -1 && endIdx !== -1) {
          const from = Math.min(startIdx, endIdx);
          const to = Math.max(startIdx, endIdx);
          const range = new Set<number>();
          for (let i = from; i <= to; i++) {
            range.add(allWordIndices[i]);
          }
          setSelectedWordIndices(range);
        }
        return;
      }

      // Single click: clear multi-select, select this word
      setSelectedWordIndices(new Set());
      onWordSelect(wordIndex);
    },
    [selectedWordIndex, allWordIndices, onWordSelect, setSelectedWordIndices]
  );

  // Advance to next/prev reviewable word
  const advanceReviewable = useCallback((reverse: boolean) => {
    setSelectedWordIndices(new Set());
    if (selectedWordIndex === null) {
      onWordSelect(reviewableIndices[0] ?? null);
      if (reviewableIndices[0] !== undefined) {
        wordRefs.current.get(reviewableIndices[0])?.scrollIntoView({ block: 'nearest' });
      }
    } else {
      const currentPos = reviewableIndices.indexOf(selectedWordIndex);
      let nextPos: number;
      if (reverse) {
        nextPos = currentPos <= 0 ? reviewableIndices.length - 1 : currentPos - 1;
      } else {
        nextPos = currentPos >= reviewableIndices.length - 1 ? 0 : currentPos + 1;
      }
      const nextIndex = reviewableIndices[nextPos];
      onWordSelect(nextIndex);
      wordRefs.current.get(nextIndex)?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedWordIndex, reviewableIndices, onWordSelect, setSelectedWordIndices]);

  // Keyboard handler for the container (Tab navigation + delete + type-to-edit)
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editingWordIndex !== null) return; // Let the action bar input handle its own keys

      if (e.key === 'Tab' && reviewableIndices.length > 0) {
        e.preventDefault();
        advanceReviewable(e.shiftKey);
      } else if (e.key === 'Enter' && selectedWordIndex !== null) {
        e.preventDefault();
        startEditing(selectedWordIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onWordSelect(null);
        setSelectedWordIndices(new Set());
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && editingWordIndex === null) {
        if (selectedWordIndices.size > 0 || selectedWordIndex !== null) {
          e.preventDefault();
          handleDelete();
        }
      } else if (e.key === '=' && selectedWordIndex !== null) {
        // Zoom photo to this word
        e.preventDefault();
        onWordDoubleClick?.(selectedWordIndex);
      } else if (selectedWordIndex !== null && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Any printable character starts editing with that character
        e.preventDefault();
        const word = words.find(w => w.word_index === selectedWordIndex);
        if (word) {
          setEditingWordIndex(selectedWordIndex);
          setEditValue(e.key);
          onWordSelect(selectedWordIndex);
        }
      }
    },
    [editingWordIndex, reviewableIndices, selectedWordIndex, onWordSelect, startEditing, selectedWordIndices, setSelectedWordIndices, handleDelete, advanceReviewable, onWordDoubleClick, words]
  );

  // Build the word style
  const getWordStyle = (word: WordData): React.CSSProperties => {
    const isSelected = word.word_index === selectedWordIndex;
    const isMultiSelected = selectedWordIndices.has(word.word_index);
    const base: React.CSSProperties = {
      display: 'inline',
      padding: '2px 4px',
      borderRadius: '3px',
      cursor: 'pointer',
      fontSize: '14px',
      lineHeight: '1.8',
      fontFamily: "'Courier New', Consolas, monospace",
      color: '#1a1a1a',
      position: 'relative',
      outline: 'none',
      transition: 'background-color 0.15s, border-color 0.15s',
      borderBottom: isSelected ? `2px solid ${brandColors.primary}` : '2px solid transparent',
      fontWeight: isSelected ? 600 : 400,
    };

    // Multi-select highlight
    if (isMultiSelected) {
      base.backgroundColor = '#bfdbfe';
      base.borderBottom = `2px solid ${brandColors.primary}`;
    }

    // Low confidence override
    if (word.confidence < 60) {
      base.color = '#dc2626';
    }

    // Correction source background (only if not multi-selected)
    if (!isMultiSelected && word.was_corrected && word.correction_source) {
      const colorDef = correctionColors[word.correction_source];
      if (colorDef) {
        base.backgroundColor = colorDef.background;
      }
    }

    return base;
  };

  // Render a single word — just a span, no inline icons or tooltips
  const renderWord = (word: WordData) => {
    return (
      <span
        key={word.word_index}
        ref={(el) => {
          if (el) {
            wordRefs.current.set(word.word_index, el);
          } else {
            wordRefs.current.delete(word.word_index);
          }
        }}
        tabIndex={-1}
        style={getWordStyle(word)}
        onClick={(e) => handleWordClick(e, word.word_index)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditing(word.word_index);
          onWordDoubleClick?.(word.word_index);
        }}
      >
        {word.corrected_text}
      </span>
    );
  };

  // ---- Action bar: sticky bar between header and text showing selected word info ----

  const renderActionBar = () => {
    const multiCount = selectedWordIndices.size;

    // Multi-select mode
    if (multiCount > 1) {
      return (
        <div style={styles.actionBar} onClick={(e) => e.stopPropagation()}>
          <span style={styles.actionBarLabel}>{multiCount} words selected</span>
          <div style={styles.actionBarButtons}>
            {onDeleteWords && (
              <button onClick={handleDelete} style={styles.actionDeleteBtn}>
                Delete {multiCount} words
              </button>
            )}
            <button
              onClick={() => { setSelectedWordIndices(new Set()); onWordSelect(null); }}
              style={styles.actionCancelBtn}
            >
              Clear
            </button>
          </div>
        </div>
      );
    }

    // Single word selected
    if (selectedWord && editingWordIndex === null) {
      const confColor = selectedWord.confidence < 60 ? '#dc2626'
        : selectedWord.confidence < 80 ? '#d97706' : '#16a34a';
      const sourceColor = selectedWord.correction_source
        ? correctionColors[selectedWord.correction_source] : null;

      return (
        <div style={styles.actionBar} onClick={(e) => e.stopPropagation()}>
          <div style={styles.actionBarInfo}>
            <span style={styles.actionBarWord}>{selectedWord.corrected_text}</span>
            {selectedWord.was_corrected && selectedWord.raw_text !== selectedWord.corrected_text && (
              <span style={styles.actionBarOriginal}>
                was: <span style={styles.actionBarOriginalText}>{selectedWord.raw_text}</span>
              </span>
            )}
            <span style={{ ...styles.actionBarConf, color: confColor }}>
              {Math.round(selectedWord.confidence)}%
            </span>
            {sourceColor && (
              <span style={{ ...styles.actionBarSource, backgroundColor: sourceColor.background }}>
                {sourceColor.label}
              </span>
            )}
          </div>
          <div style={styles.actionBarButtons}>
            {onConfirmWord && (
              <button onClick={handleConfirm} style={styles.actionConfirmBtn}>
                Confirm
              </button>
            )}
            <button onClick={() => startEditing(selectedWord.word_index)} style={styles.actionEditBtn}>
              Edit
            </button>
            {onDeleteWords && (
              <button onClick={handleDelete} style={styles.actionDeleteBtn}>
                Delete
              </button>
            )}
          </div>
        </div>
      );
    }

    // Editing mode in action bar
    if (selectedWord && editingWordIndex !== null) {
      return (
        <div style={styles.actionBar} onClick={(e) => e.stopPropagation()}>
          <div style={styles.actionBarEditRow}>
            <span style={styles.actionBarEditLabel}>Editing:</span>
            <input
              ref={actionBarEditRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  submitEdit(editingWordIndex);
                  // Tab advances to next reviewable word after saving
                  if (e.key === 'Tab') {
                    setTimeout(() => advanceReviewable(e.shiftKey), 0);
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEditing();
                }
                e.stopPropagation();
              }}
              style={styles.actionBarInput}
            />
            <button
              onClick={() => submitEdit(editingWordIndex)}
              style={styles.actionSaveBtn}
            >
              Save
            </button>
            <button onClick={cancelEditing} style={styles.actionCancelBtn}>
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      ref={containerRef}
      style={styles.container}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      onClick={() => {
        if (editingWordIndex === null) {
          onWordSelect(null);
          setSelectedWordIndices(new Set());
        }
      }}
    >
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.statsRow}>
          <span style={styles.statText}>
            {totalWords} words, {totalCorrections} correction{totalCorrections !== 1 ? 's' : ''}
            {lowConfCount > 0 && `, ${lowConfCount} low-conf`}
          </span>
          <div style={styles.legendRow}>
            <span style={{ ...styles.legendItem, backgroundColor: correctionColors.dictionary.background }}>
              Dictionary
            </span>
            <span style={{ ...styles.legendItem, backgroundColor: correctionColors.learned.background }}>
              Learned
            </span>
            <span style={{ ...styles.legendItem, backgroundColor: correctionColors.user.background }}>
              User
            </span>
            <span style={{ ...styles.legendItem, color: '#dc2626', backgroundColor: '#fef2f2' }}>
              Low conf.
            </span>
          </div>
        </div>
        <div style={styles.helpText}>
          Tab cycles reviewable | Confirm / Edit / Delete | Enter to edit | Shift+click for range
        </div>
      </div>

      {/* Sticky action bar — always visible when word(s) selected */}
      {renderActionBar()}

      {/* Word content area */}
      <div style={styles.textArea}>
        {blocks.map((block, blockIdx) => (
          <div key={block.blockIndex} style={blockIdx > 0 ? styles.blockBreak : undefined}>
            {block.lines.map((line) => (
              <div key={`${block.blockIndex}-${line.lineIndex}`} style={styles.line}>
                {line.words.map((word, wordIdx) => (
                  <span key={word.word_index}>
                    {wordIdx > 0 && <span style={styles.wordSpace}> </span>}
                    {renderWord(word)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    outline: 'none',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
    flexShrink: 0,
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  statText: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#374151',
  },
  legendRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  legendItem: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '10px',
    color: '#374151',
    fontWeight: 500,
  },
  helpText: {
    fontSize: '11px',
    color: '#9ca3af',
    marginTop: '6px',
  },
  // ---- Sticky action bar ----
  actionBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '8px 14px',
    backgroundColor: '#f0fdfa',
    borderBottom: `2px solid ${brandColors.primary}`,
    flexShrink: 0,
    flexWrap: 'wrap' as const,
    minHeight: '40px',
  },
  actionBarInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap' as const,
    minWidth: 0,
  },
  actionBarWord: {
    fontFamily: "'Courier New', Consolas, monospace",
    fontSize: '15px',
    fontWeight: 700,
    color: '#0f172a',
    backgroundColor: '#e0f2fe',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  actionBarOriginal: {
    fontSize: '12px',
    color: '#6b7280',
  },
  actionBarOriginalText: {
    fontFamily: "'Courier New', Consolas, monospace",
    textDecoration: 'line-through',
    color: '#9ca3af',
  },
  actionBarConf: {
    fontSize: '12px',
    fontWeight: 700,
  },
  actionBarSource: {
    fontSize: '11px',
    padding: '1px 8px',
    borderRadius: '10px',
    color: '#374151',
    fontWeight: 500,
  },
  actionBarLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1e40af',
  },
  actionBarButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  actionConfirmBtn: {
    padding: '5px 14px',
    borderRadius: '6px',
    border: '1px solid #86efac',
    background: '#f0fdf4',
    color: '#166534',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
  actionEditBtn: {
    padding: '5px 14px',
    borderRadius: '6px',
    border: `1px solid ${brandColors.primary}`,
    background: 'white',
    color: brandColors.primary,
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
  actionDeleteBtn: {
    padding: '5px 14px',
    borderRadius: '6px',
    border: '1px solid #fca5a5',
    background: '#fef2f2',
    color: '#dc2626',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
  actionSaveBtn: {
    padding: '5px 14px',
    borderRadius: '6px',
    border: 'none',
    background: brandColors.primary,
    color: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
  actionCancelBtn: {
    padding: '5px 14px',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    background: 'white',
    color: '#6b7280',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  actionBarEditRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    flexWrap: 'wrap' as const,
  },
  actionBarEditLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: brandColors.primary,
    flexShrink: 0,
  },
  actionBarInput: {
    flex: 1,
    minWidth: '100px',
    fontSize: '14px',
    fontFamily: "'Courier New', Consolas, monospace",
    padding: '4px 8px',
    border: `2px solid ${brandColors.primary}`,
    borderRadius: '6px',
    outline: 'none',
    backgroundColor: 'white',
    color: '#1a1a1a',
  },
  // ---- Text area ----
  textArea: {
    padding: '16px',
    minHeight: '100px',
    flex: 1,
    overflowY: 'auto' as const,
  },
  blockBreak: {
    marginTop: '16px',
  },
  line: {
    marginBottom: '4px',
  },
  wordSpace: {
    display: 'inline',
    fontSize: '14px',
  },
};
