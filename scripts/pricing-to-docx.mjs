/**
 * Convert PRICING-STRATEGY.md to a professionally formatted .docx
 * Usage: node scripts/pricing-to-docx.mjs
 */

import fs from 'fs';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, HeadingLevel, ShadingType,
  PageBreak, Header, Footer,
} from 'docx';

const md = fs.readFileSync('docs/specs/PRICING-STRATEGY.md', 'utf-8');
const lines = md.split('\n');

// Brand colors
const TEAL = '0d7377';
const DARK = '0f172a';
const GRAY = '475569';
const LIGHT_GRAY = 'f1f5f9';
const WHITE = 'ffffff';

const children = [];

// Title page
children.push(
  new Paragraph({ spacing: { before: 3000 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'THIRST METRICS TEXAS', bold: true, size: 48, color: TEAL, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: 'Pricing Strategy & Go-to-Market Plan', size: 32, color: DARK, font: 'Calibri' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: 'DRAFT — March 2026', size: 24, color: GRAY, font: 'Calibri', italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: 'Target Revenue: $5,000/month (1 FTE) by End of Year 1', size: 22, color: DARK, font: 'Calibri' })],
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// Parse markdown
let i = 0;
while (i < lines.length) {
  const line = lines[i];

  // Skip the title and status lines (already on title page)
  if (i < 5) { i++; continue; }

  // Headings
  if (line.startsWith('## ')) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 },
      children: [new TextRun({ text: line.replace('## ', ''), bold: true, size: 28, color: TEAL, font: 'Calibri' })],
    }));
    i++;
    continue;
  }

  if (line.startsWith('### ')) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 300, after: 150 },
      children: [new TextRun({ text: line.replace('### ', ''), bold: true, size: 24, color: DARK, font: 'Calibri' })],
    }));
    i++;
    continue;
  }

  if (line.startsWith('# ') && i > 5) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 300 },
      children: [new TextRun({ text: line.replace('# ', ''), bold: true, size: 32, color: TEAL, font: 'Calibri' })],
    }));
    i++;
    continue;
  }

  // Tables
  if (line.startsWith('|')) {
    const tableLines = [];
    while (i < lines.length && lines[i].startsWith('|')) {
      const row = lines[i];
      // Skip separator rows
      if (!/^\|[\s\-:|]+\|$/.test(row)) {
        tableLines.push(row);
      }
      i++;
    }

    if (tableLines.length > 0) {
      const rows = tableLines.map((tl, rowIdx) => {
        const cells = tl.split('|').filter(c => c !== '').map(c => c.trim());
        return new TableRow({
          children: cells.map(cellText => new TableCell({
            shading: rowIdx === 0
              ? { type: ShadingType.SOLID, color: TEAL }
              : rowIdx % 2 === 0
                ? { type: ShadingType.SOLID, color: LIGHT_GRAY }
                : { type: ShadingType.SOLID, color: WHITE },
            width: { size: Math.floor(9000 / cells.length), type: WidthType.DXA },
            children: [new Paragraph({
              spacing: { before: 40, after: 40 },
              children: [new TextRun({
                text: cellText,
                bold: rowIdx === 0,
                size: 18,
                color: rowIdx === 0 ? WHITE : DARK,
                font: 'Calibri',
              })],
            })],
          })),
        });
      });

      children.push(new Table({
        width: { size: 9000, type: WidthType.DXA },
        rows,
      }));
      children.push(new Paragraph({ spacing: { after: 200 } }));
    }
    continue;
  }

  // Horizontal rules / section breaks
  if (line.startsWith('---')) {
    children.push(new Paragraph({
      spacing: { before: 200, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' } },
    }));
    i++;
    continue;
  }

  // Bullet points
  if (line.startsWith('- ') || line.startsWith('  - ')) {
    const indent = line.startsWith('  - ') ? 720 : 360;
    const text = line.replace(/^\s*- /, '');
    // Handle bold within bullets
    const parts = parseBold(text);
    children.push(new Paragraph({
      indent: { left: indent },
      spacing: { before: 40, after: 40 },
      bullet: { level: indent > 360 ? 1 : 0 },
      children: parts,
    }));
    i++;
    continue;
  }

  // Numbered list
  if (/^\d+\. /.test(line)) {
    const text = line.replace(/^\d+\. /, '');
    const parts = parseBold(text);
    children.push(new Paragraph({
      indent: { left: 360 },
      spacing: { before: 40, after: 40 },
      children: parts,
    }));
    i++;
    continue;
  }

  // Regular paragraph
  if (line.trim().length > 0) {
    const parts = parseBold(line);
    children.push(new Paragraph({
      spacing: { before: 80, after: 80 },
      children: parts,
    }));
  }

  i++;
}

function parseBold(text) {
  const parts = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(new TextRun({ text: text.slice(lastIndex, match.index), size: 20, color: DARK, font: 'Calibri' }));
    }
    parts.push(new TextRun({ text: match[1], bold: true, size: 20, color: DARK, font: 'Calibri' }));
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(new TextRun({ text: text.slice(lastIndex), size: 20, color: DARK, font: 'Calibri' }));
  }

  return parts.length > 0 ? parts : [new TextRun({ text, size: 20, color: DARK, font: 'Calibri' })];
}

// Build document
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: 'Calibri', size: 20, color: DARK },
      },
    },
  },
  sections: [{
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: 'Thirst Metrics Texas — Pricing Strategy', size: 16, color: GRAY, italics: true, font: 'Calibri' })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'CONFIDENTIAL — DRAFT', size: 14, color: GRAY, font: 'Calibri' })],
        })],
      }),
    },
    children,
  }],
});

const buffer = await Packer.toBuffer(doc);
const outPath = 'docs/specs/PRICING-STRATEGY.docx';
fs.writeFileSync(outPath, buffer);
console.log(`Written to ${outPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
