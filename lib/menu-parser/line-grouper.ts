/**
 * Line Grouper
 * Groups OCR words into logical lines based on block_index and line_index,
 * then sorts lines top-to-bottom by Y position.
 */

import { WordData, ParsedLine } from './types';

/**
 * Group words into lines by (blockIndex, lineIndex) composite key,
 * then sort lines top-to-bottom by average Y position.
 */
export function groupWordsIntoLines(words: WordData[]): ParsedLine[] {
  if (words.length === 0) return [];

  // Group by composite key
  const lineMap = new Map<string, WordData[]>();

  for (const word of words) {
    const key = `${word.block_index}_${word.line_index}`;
    if (!lineMap.has(key)) {
      lineMap.set(key, []);
    }
    lineMap.get(key)!.push(word);
  }

  // Build ParsedLine objects
  const lines: ParsedLine[] = [];

  for (const [key, lineWords] of lineMap) {
    // Sort words left-to-right within a line
    lineWords.sort((a, b) => a.bbox_x0 - b.bbox_x0);

    const text = lineWords.map(w => w.corrected_text || w.raw_text).join(' ');
    const avgY = lineWords.reduce((sum, w) => sum + w.bbox_y0, 0) / lineWords.length;
    const avgHeight = lineWords.reduce((sum, w) => sum + (w.bbox_y1 - w.bbox_y0), 0) / lineWords.length;

    const [blockStr, lineStr] = key.split('_');

    lines.push({
      words: lineWords,
      text,
      avgY,
      height: avgHeight,
      blockIndex: parseInt(blockStr, 10),
      lineIndex: parseInt(lineStr, 10),
    });
  }

  // Sort lines top-to-bottom by Y position
  lines.sort((a, b) => a.avgY - b.avgY);

  return lines;
}
