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
 * - Keyboard navigation: Tab between corrected words, Enter to edit, Escape to cancel
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
  const { words, selectedWordIndex, onWordSelect, onCorrection } = props;

  const [editingWordIndex, setEditingWordIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<Map<number, HTMLSpanElement>>(new Map());

  // Memoize grouped structure
  const blocks = useMemo(() => groupWords(words), [words]);

  // Collect corrected word indices for Tab navigation
  const correctedIndices = useMemo(() => {
    return words
      .filter((w) => w.was_corrected)
      .map((w) => w.word_index)
      .sort((a, b) => a - b);
  }, [words]);

  // Stats
  const totalWords = words.length;
  const totalCorrections = words.filter((w) => w.was_corrected).length;

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

  // Keyboard handler for the container (Tab navigation)
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editingWordIndex !== null) return; // Let the input handle its own keys

      if (e.key === 'Tab' && correctedIndices.length > 0) {
        e.preventDefault();
        if (selectedWordIndex === null) {
          onWordSelect(correctedIndices[0]);
          wordRefs.current.get(correctedIndices[0])?.focus();
        } else {
          const currentPos = correctedIndices.indexOf(selectedWordIndex);
          let nextPos: number;
          if (e.shiftKey) {
            nextPos = currentPos <= 0 ? correctedIndices.length - 1 : currentPos - 1;
          } else {
            nextPos = currentPos >= correctedIndices.length - 1 ? 0 : currentPos + 1;
          }
          const nextIndex = correctedIndices[nextPos];
          onWordSelect(nextIndex);
          wordRefs.current.get(nextIndex)?.focus();
        }
      } else if (e.key === 'Enter' && selectedWordIndex !== null) {
        e.preventDefault();
        startEditing(selectedWordIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onWordSelect(null);
      }
    },
    [editingWordIndex, correctedIndices, selectedWordIndex, onWordSelect, startEditing]
  );

  // Build the word style
  const getWordStyle = (word: WordData): React.CSSProperties => {
    const isSelected = word.word_index === selectedWordIndex;
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

    // Low confidence override
    if (word.confidence < 60) {
      base.color = '#dc2626';
    }

    // Correction source background
    if (word.was_corrected && word.correction_source) {
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
        onClick={(e) => {
          e.stopPropagation();
          onWordSelect(word.word_index);
        }}
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
            : undefined
        }
      >
        {word.corrected_text}
        {/* Edit icon for corrected/selected words */}
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
      </span>
    );
  };

  // Render the tooltip/popover for the selected word
  const renderTooltip = () => {
    if (selectedWordIndex === null || editingWordIndex !== null) return null;

    const word = words.find((w) => w.word_index === selectedWordIndex);
    if (!word || !word.was_corrected) return null;

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

  return (
    <div
      ref={containerRef}
      style={styles.container}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      onClick={() => {
        if (editingWordIndex === null) {
          onWordSelect(null);
        }
      }}
    >
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.statsRow}>
          <span style={styles.statText}>
            {totalWords} words, {totalCorrections} correction{totalCorrections !== 1 ? 's' : ''}
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
          Click to select | Double-click to edit | Tab between corrections
        </div>
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
