/**
 * OCR Text Editor Component
 * Renders OCR text word-by-word as clickable spans with correction highlighting.
 *
 * Features:
 * - Words grouped by line_index and block_index
 * - Color-coded correction sources (dictionary, learned, user)
 * - Low confidence words highlighted in red
 * - Click to select and view correction details
 * - Double-click or edit icon to inline-edit any word
 * - Keyboard navigation: Tab between reviewable words (corrected + low-confidence),
 *   Enter to edit, Escape to cancel, Delete/Backspace to delete
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
  onDeleteWords?: (wordIndices: number[]) => void;
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
    onDeleteWords,
    selectedWordIndices: externalSelectedIndices,
    onSelectedWordIndicesChange,
  } = props;

  const [editingWordIndex, setEditingWordIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [internalMultiSelect, setInternalMultiSelect] = useState<Set<number>>(new Set());
  const editInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

  // Use external multi-select state if provided, otherwise internal
  const selectedWordIndices = externalSelectedIndices ?? internalMultiSelect;
  const setSelectedWordIndices = onSelectedWordIndicesChange ?? setInternalMultiSelect;

  // Memoize grouped structure
  const blocks = useMemo(() => groupWords(words), [words]);

  // Collect reviewable word indices for Tab navigation: corrected OR low confidence
  const reviewableIndices = useMemo(() => {
    return words
      .filter((w) => w.was_corrected || w.confidence < 60)
      .map((w) => w.word_index)
      .sort((a, b) => a - b);
  }, [words]);

  // All word indices sorted for Shift+click range selection
  const allWordIndices = useMemo(() => {
    return words.map(w => w.word_index).sort((a, b) => a - b);
  }, [words]);

  // Stats
  const totalWords = words.length;
  const totalCorrections = words.filter((w) => w.was_corrected).length;
  const lowConfCount = words.filter((w) => w.confidence < 60).length;

  // Auto-focus edit input when editing begins
  useEffect(() => {
    if (editingWordIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
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
    },
    [words, editValue, onCorrection]
  );

  // Delete selected words
  const handleDelete = useCallback(() => {
    if (!onDeleteWords) return;
    const indicesToDelete: number[] = [];

    if (selectedWordIndices.size > 0) {
      indicesToDelete.push(...Array.from(selectedWordIndices));
    } else if (selectedWordIndex !== null) {
      indicesToDelete.push(selectedWordIndex);
    }

    if (indicesToDelete.length > 0) {
      onDeleteWords(indicesToDelete);
      setSelectedWordIndices(new Set());
    }
  }, [onDeleteWords, selectedWordIndices, selectedWordIndex, setSelectedWordIndices]);

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

  // Keyboard handler for the container (Tab navigation + delete)
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editingWordIndex !== null) return; // Let the input handle its own keys

      if (e.key === 'Tab' && reviewableIndices.length > 0) {
        e.preventDefault();
        // Clear multi-select on tab navigation
        setSelectedWordIndices(new Set());
        if (selectedWordIndex === null) {
          onWordSelect(reviewableIndices[0]);
          wordRefs.current.get(reviewableIndices[0])?.focus();
        } else {
          const currentPos = reviewableIndices.indexOf(selectedWordIndex);
          let nextPos: number;
          if (e.shiftKey) {
            nextPos = currentPos <= 0 ? reviewableIndices.length - 1 : currentPos - 1;
          } else {
            nextPos = currentPos >= reviewableIndices.length - 1 ? 0 : currentPos + 1;
          }
          const nextIndex = reviewableIndices[nextPos];
          onWordSelect(nextIndex);
          wordRefs.current.get(nextIndex)?.focus();
        }
      } else if (e.key === 'Enter' && selectedWordIndex !== null) {
        e.preventDefault();
        startEditing(selectedWordIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onWordSelect(null);
        setSelectedWordIndices(new Set());
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && editingWordIndex === null) {
        // Delete selected word(s) if not editing
        if (selectedWordIndices.size > 0 || selectedWordIndex !== null) {
          e.preventDefault();
          handleDelete();
        }
      }
    },
    [editingWordIndex, reviewableIndices, selectedWordIndex, onWordSelect, startEditing, selectedWordIndices, setSelectedWordIndices, handleDelete]
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

    // Multi-select highlight (takes precedence over other backgrounds)
    if (isMultiSelected) {
      base.backgroundColor = '#bfdbfe'; // blue-200
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

  // Render a single word
  const renderWord = (word: WordData) => {
    const isEditing = editingWordIndex === word.word_index;
    const isSelected = word.word_index === selectedWordIndex;

    if (isEditing) {
      return (
        <span
          key={word.word_index}
          style={{
            display: 'inline-block',
            position: 'relative',
          }}
        >
          <input
            ref={editInputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitEdit(word.word_index);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEditing();
              }
              e.stopPropagation();
            }}
            onBlur={() => cancelEditing()}
            style={styles.inlineInput}
          />
        </span>
      );
    }

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
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            startEditing(word.word_index);
          }
        }}
        title={
          word.was_corrected
            ? `Original: ${word.raw_text} | Corrected: ${word.corrected_text} | Source: ${word.correction_source} | Confidence: ${Math.round(word.confidence)}%`
            : word.confidence < 60
            ? `Low confidence: ${Math.round(word.confidence)}% | Text: ${word.raw_text}`
            : undefined
        }
      >
        {word.corrected_text}
        {/* Edit icon for selected words */}
        {isSelected && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              startEditing(word.word_index);
            }}
            style={styles.editIcon}
            title="Edit word"
          >
            &#9998;
          </span>
        )}
        {/* Delete icon for selected words */}
        {isSelected && onDeleteWords && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            style={styles.deleteIcon}
            title="Delete word"
          >
            &times;
          </span>
        )}
      </span>
    );
  };

  // Render the tooltip/popover for the selected word
  const renderTooltip = () => {
    if (selectedWordIndex === null || editingWordIndex !== null) return null;
    // Show tooltip when multi-selected too
    if (selectedWordIndices.size > 1) return null;

    const word = words.find((w) => w.word_index === selectedWordIndex);
    if (!word) return null;
    // Show tooltip for corrected words or low-confidence words
    if (!word.was_corrected && word.confidence >= 60) return null;

    const spanEl = wordRefs.current.get(selectedWordIndex);
    if (!spanEl || !containerRef.current) return null;

    const containerRect = containerRef.current.getBoundingClientRect();
    const spanRect = spanEl.getBoundingClientRect();

    const left = spanRect.left - containerRect.left + spanRect.width / 2;
    const top = spanRect.top - containerRect.top - 8;

    const sourceColor = word.correction_source
      ? correctionColors[word.correction_source]
      : null;

    return (
      <div
        style={{
          ...styles.tooltip,
          left: `${left}px`,
          top: `${top}px`,
          transform: 'translate(-50%, -100%)',
        }}
      >
        <div style={styles.tooltipRow}>
          <span style={styles.tooltipLabel}>Original:</span>
          <span style={styles.tooltipValue}>{word.raw_text}</span>
        </div>
        <div style={styles.tooltipRow}>
          <span style={styles.tooltipLabel}>Corrected:</span>
          <span style={{ ...styles.tooltipValue, fontWeight: 600 }}>{word.corrected_text}</span>
        </div>
        {word.was_corrected && (
          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>Source:</span>
            <span
              style={{
                ...styles.tooltipBadge,
                backgroundColor: sourceColor?.background || '#f3f4f6',
              }}
            >
              {sourceColor?.label || word.correction_source || 'Unknown'}
            </span>
          </div>
        )}
        <div style={styles.tooltipRow}>
          <span style={styles.tooltipLabel}>Confidence:</span>
          <span
            style={{
              ...styles.tooltipValue,
              color: word.confidence < 60 ? '#dc2626' : word.confidence < 80 ? '#d97706' : '#16a34a',
            }}
          >
            {Math.round(word.confidence)}%
          </span>
        </div>
        <div style={styles.tooltipArrow} />
      </div>
    );
  };

  const multiSelectCount = selectedWordIndices.size;

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
          Click to select | Double-click to edit | Tab between reviewable words | Shift+click to select range
          {onDeleteWords && ' | Delete/Backspace to remove'}
        </div>
        {/* Multi-select indicator */}
        {multiSelectCount > 1 && (
          <div style={styles.multiSelectBar}>
            <span style={styles.multiSelectText}>
              {multiSelectCount} words selected
            </span>
            {onDeleteWords && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                style={styles.multiDeleteButton}
              >
                Delete selected
              </button>
            )}
          </div>
        )}
      </div>

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

        {/* Tooltip popover */}
        {renderTooltip()}
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
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
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
  multiSelectBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '8px',
    padding: '6px 10px',
    background: '#eff6ff',
    borderRadius: '6px',
    border: '1px solid #bfdbfe',
  },
  multiSelectText: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#1e40af',
  },
  multiDeleteButton: {
    padding: '3px 10px',
    borderRadius: '6px',
    border: '1px solid #fca5a5',
    background: '#fef2f2',
    color: '#dc2626',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
  },
  textArea: {
    padding: '16px',
    position: 'relative' as const,
    minHeight: '100px',
    maxHeight: '500px',
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
  editIcon: {
    display: 'inline-block',
    marginLeft: '3px',
    fontSize: '12px',
    color: brandColors.primary,
    cursor: 'pointer',
    verticalAlign: 'middle',
  },
  deleteIcon: {
    display: 'inline-block',
    marginLeft: '2px',
    fontSize: '14px',
    color: '#dc2626',
    cursor: 'pointer',
    verticalAlign: 'middle',
    fontWeight: '700',
    lineHeight: 1,
  },
  inlineInput: {
    fontSize: '14px',
    fontFamily: "'Courier New', Consolas, monospace",
    padding: '2px 4px',
    border: `2px solid ${brandColors.primary}`,
    borderRadius: '3px',
    outline: 'none',
    backgroundColor: brandColors.primaryLight,
    color: '#1a1a1a',
    minWidth: '40px',
    maxWidth: '200px',
  },
  // Tooltip styles
  tooltip: {
    position: 'absolute' as const,
    zIndex: 50,
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '10px 14px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    minWidth: '180px',
    pointerEvents: 'none' as const,
  },
  tooltipRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '4px',
    fontSize: '12px',
  },
  tooltipLabel: {
    color: '#6b7280',
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
  },
  tooltipValue: {
    color: '#1f2937',
    fontFamily: "'Courier New', Consolas, monospace",
    fontSize: '12px',
  },
  tooltipBadge: {
    fontSize: '11px',
    padding: '1px 8px',
    borderRadius: '10px',
    color: '#374151',
    fontWeight: 500,
  },
  tooltipArrow: {
    position: 'absolute' as const,
    bottom: '-6px',
    left: '50%',
    transform: 'translateX(-50%) rotate(45deg)',
    width: '10px',
    height: '10px',
    backgroundColor: '#ffffff',
    borderRight: '1px solid #e5e7eb',
    borderBottom: '1px solid #e5e7eb',
  },
};
