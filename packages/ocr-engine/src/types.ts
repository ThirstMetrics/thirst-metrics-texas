/**
 * OCR Engine Type Definitions
 * All public interfaces for the standalone OCR pipeline
 */

// ============================================
// Geometry
// ============================================

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// ============================================
// Word-level OCR Data
// ============================================

export interface OCRWord {
  index: number;
  rawText: string;
  correctedText: string;
  confidence: number;
  bbox: BBox;
  wasCorrected: boolean;
  correctionSource: 'dictionary' | 'learned' | null;
  /** Key in the dictionary that matched (lowercase) */
  dictionaryKey: string | null;
  lineIndex: number;
  blockIndex: number;
}

export interface OCRLine {
  index: number;
  text: string;
  correctedText: string;
  confidence: number;
  bbox: BBox;
  words: OCRWord[];
  blockIndex: number;
}

export interface OCRBlock {
  index: number;
  text: string;
  correctedText: string;
  confidence: number;
  bbox: BBox;
  lines: OCRLine[];
}

// ============================================
// Correction Tracking
// ============================================

export interface CorrectionRecord {
  wordIndex: number;
  originalText: string;
  correctedText: string;
  correctionSource: 'dictionary' | 'learned';
  dictionaryKey: string;
  confidence: number;
  bbox: BBox;
  lineIndex: number;
  blockIndex: number;
}

// ============================================
// Dictionary
// ============================================

export interface DictionaryEntry {
  mistake: string;
  correction: string;
  source: 'built-in' | 'learned';
  /** Number of words in the mistake pattern */
  wordCount: number;
}

export interface DictionaryStats {
  builtInCount: number;
  learnedCount: number;
  totalCount: number;
}

export interface LearnedDictionaryEntry {
  mistakeText: string;
  correctionText: string;
  confirmationCount: number;
  isActive: boolean;
}

// ============================================
// Pipeline Configuration
// ============================================

export interface OCRPipelineConfig {
  /** Language for Tesseract (default: 'eng') */
  language?: string;
  /** Learned dictionary entries to merge with built-in */
  learnedEntries?: LearnedDictionaryEntry[];
  /** Custom Tesseract worker path */
  workerPath?: string;
  /** Logger callback */
  logger?: (message: string) => void;
}

// ============================================
// Pipeline Result
// ============================================

export interface OCRPipelineResult {
  success: boolean;
  confidence: number;
  processingTimeMs: number;
  rawText: string;
  correctedText: string;
  beverageTerms: string[];
  words: OCRWord[];
  lines: OCRLine[];
  blocks: OCRBlock[];
  corrections: CorrectionRecord[];
  imageDimensions: { width: number; height: number };
  error?: string;
}

// ============================================
// Legacy Compatibility
// ============================================

/** Backward-compatible result matching existing OCRResult from tesseract-server.ts */
export interface OCRResultCompat {
  success: boolean;
  rawText: string;
  correctedText: string;
  beverageTerms: string[];
  confidence: number;
  processingTimeMs: number;
  error?: string;
}
