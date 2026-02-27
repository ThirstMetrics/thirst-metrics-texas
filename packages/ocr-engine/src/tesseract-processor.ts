/**
 * Tesseract Processor
 * Wraps Tesseract.js to extract word/line/block data with bounding boxes.
 * No framework dependency — pure Node.js + tesseract.js.
 */

import Tesseract from 'tesseract.js';
import path from 'path';
import type { OCRWord, OCRLine, OCRBlock, BBox } from './types';

// ============================================
// Persistent Worker (singleton)
// ============================================

let workerInstance: Tesseract.Worker | null = null;
let workerInitializing: Promise<Tesseract.Worker> | null = null;

interface ProcessorConfig {
  language?: string;
  workerPath?: string;
  logger?: (message: string) => void;
}

async function getWorker(config: ProcessorConfig = {}): Promise<Tesseract.Worker> {
  if (workerInstance) return workerInstance;
  if (workerInitializing) return workerInitializing;

  const log = config.logger || ((msg: string) => console.log(`[OCR] ${msg}`));

  workerInitializing = (async () => {
    log('Initializing Tesseract worker...');
    const startTime = Date.now();

    const workerPathResolved = config.workerPath || path.resolve(
      process.cwd(),
      'node_modules',
      'tesseract.js',
      'src',
      'worker-script',
      'node',
      'index.js'
    );

    const worker = await Tesseract.createWorker(config.language || 'eng', undefined, {
      workerPath: workerPathResolved,
      logger: (m) => {
        if (m.status === 'recognizing text') return;
        log(`${m.status}: ${typeof m.progress === 'number' ? (m.progress * 100).toFixed(0) + '%' : ''}`);
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Worker ready in ${elapsed}s`);

    workerInstance = worker;
    workerInitializing = null;
    return worker;
  })();

  return workerInitializing;
}

// ============================================
// Raw Tesseract Result Processing
// ============================================

interface TesseractProcessResult {
  words: OCRWord[];
  lines: OCRLine[];
  blocks: OCRBlock[];
  rawText: string;
  confidence: number;
  imageDimensions: { width: number; height: number };
}

function extractBBox(item: { bbox: { x0: number; y0: number; x1: number; y1: number } }): BBox {
  return {
    x0: item.bbox.x0,
    y0: item.bbox.y0,
    x1: item.bbox.x1,
    y1: item.bbox.y1,
  };
}

function buildStructuredData(data: Tesseract.Page): { words: OCRWord[]; lines: OCRLine[]; blocks: OCRBlock[] } {
  const words: OCRWord[] = [];
  const lines: OCRLine[] = [];
  const blocks: OCRBlock[] = [];

  let wordIndex = 0;
  let lineIndex = 0;
  let blockIndex = 0;

  if (!data.blocks) {
    return { words, lines, blocks };
  }

  for (const tBlock of data.blocks) {
    const blockWords: OCRWord[] = [];
    const blockLines: OCRLine[] = [];

    if (!tBlock.paragraphs) {
      blockIndex++;
      continue;
    }

    for (const para of tBlock.paragraphs) {
      if (!para.lines) continue;

      for (const tLine of para.lines) {
        const lineWords: OCRWord[] = [];

        if (tLine.words) {
          for (const tWord of tLine.words) {
            const text = tWord.text?.trim() || '';
            if (!text) continue;

            const word: OCRWord = {
              index: wordIndex,
              rawText: text,
              correctedText: text, // Will be updated by spell corrector
              confidence: tWord.confidence || 0,
              bbox: extractBBox(tWord),
              wasCorrected: false,
              correctionSource: null,
              dictionaryKey: null,
              lineIndex,
              blockIndex,
            };

            words.push(word);
            lineWords.push(word);
            blockWords.push(word);
            wordIndex++;
          }
        }

        const lineText = lineWords.map(w => w.rawText).join(' ');
        const line: OCRLine = {
          index: lineIndex,
          text: lineText,
          correctedText: lineText, // Will be updated after correction
          confidence: tLine.confidence || 0,
          bbox: extractBBox(tLine),
          words: lineWords,
          blockIndex,
        };

        lines.push(line);
        blockLines.push(line);
        lineIndex++;
      }
    }

    const blockText = blockLines.map(l => l.text).join('\n');
    const block: OCRBlock = {
      index: blockIndex,
      text: blockText,
      correctedText: blockText, // Will be updated after correction
      confidence: tBlock.confidence || 0,
      bbox: extractBBox(tBlock),
      lines: blockLines,
    };

    blocks.push(block);
    blockIndex++;
  }

  return { words, lines, blocks };
}

// ============================================
// Public API
// ============================================

/** Process an image buffer and return structured word-level OCR data */
export async function processImage(
  imageData: Buffer,
  config: ProcessorConfig = {}
): Promise<TesseractProcessResult> {
  const worker = await getWorker(config);
  const result = await worker.recognize(imageData);

  const rawText = result.data.text?.trim() || '';
  const confidence = result.data.confidence || 0;
  const { words, lines, blocks } = buildStructuredData(result.data);

  // Estimate image dimensions from the outermost bounding box
  let maxX = 0;
  let maxY = 0;
  for (const block of blocks) {
    if (block.bbox.x1 > maxX) maxX = block.bbox.x1;
    if (block.bbox.y1 > maxY) maxY = block.bbox.y1;
  }

  return {
    words,
    lines,
    blocks,
    rawText,
    confidence,
    imageDimensions: { width: maxX, height: maxY },
  };
}

/** Process an image from a URL */
export async function processImageFromUrl(
  imageUrl: string,
  config: ProcessorConfig = {}
): Promise<TesseractProcessResult> {
  const log = config.logger || ((msg: string) => console.log(`[OCR] ${msg}`));
  log(`Fetching image: ${imageUrl.slice(0, 80)}...`);

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const imageBuffer = await response.arrayBuffer();
  const imageData = Buffer.from(imageBuffer);
  log(`Image fetched: ${(imageData.length / 1024).toFixed(0)}KB`);

  return processImage(imageData, config);
}

/** Process a base64-encoded image */
export async function processBase64Image(
  base64Data: string,
  config: ProcessorConfig = {}
): Promise<TesseractProcessResult> {
  const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const imageData = Buffer.from(base64Clean, 'base64');
  return processImage(imageData, config);
}

/** Pre-warm the Tesseract worker */
export async function warmup(config: ProcessorConfig = {}): Promise<void> {
  await getWorker(config);
}

/** Update corrected text on lines/blocks after word-level corrections */
export function rebuildCorrectedText(words: OCRWord[], lines: OCRLine[], blocks: OCRBlock[]): void {
  for (const line of lines) {
    line.correctedText = line.words.map(w => w.correctedText).join(' ');
  }
  for (const block of blocks) {
    block.correctedText = block.lines.map(l => l.correctedText).join('\n');
  }
}
