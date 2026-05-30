// Text splitter: merge paragraphs up to maxSize, split at paragraph boundaries.
// Table-aware: keeps Markdown table rows intact across chunk boundaries.

export interface ChunkConfig {
  maxChunkSize?: number;
  overlapSize?: number;
}

export interface TextChunk {
  content: string;
  charStart: number;
  charEnd: number;
}

const DEFAULT_MAX_CHUNK_SIZE = 2000;
const DEFAULT_OVERLAP_SIZE = 200;

export function splitTextIntoChunks(
  text: string,
  config: ChunkConfig = {}
): TextChunk[] {
  const maxSize = config.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const overlap = config.overlapSize ?? DEFAULT_OVERLAP_SIZE;

  if (!text.trim()) return [];

  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return [];

  const chunks: TextChunk[] = [];
  let currentContent = "";
  let currentStart = 0;

  for (const para of paragraphs) {
    const paraText = para.content;

    if (currentContent.length + paraText.length > maxSize && currentContent.length > 0) {
      chunks.push({
        content: currentContent.trimEnd(),
        charStart: currentStart,
        charEnd: para.charStart,
      });

      const overlapText = extractOverlap(currentContent, overlap);
      currentContent = overlapText + paraText;
      currentStart = para.charStart - overlapText.length;
      continue;
    }

    // Handle single oversized paragraph
    if (paraText.length > maxSize) {
      if (currentContent.trim()) {
        chunks.push({
          content: currentContent.trimEnd(),
          charStart: currentStart,
          charEnd: para.charStart,
        });
      }

      const subChunks = isMarkdownTable(paraText)
        ? splitOversizedTable(paraText, para.charStart, maxSize)
        : splitOversizedParagraph(paraText, para.charStart, maxSize, overlap);
      chunks.push(...subChunks);

      currentContent = extractOverlap(lastSubChunkText(subChunks) || paraText, overlap);
      currentStart = para.charStart + paraText.length - currentContent.length;
      continue;
    }

    // Normal case: accumulate paragraphs
    if (!currentContent) {
      currentStart = para.charStart;
    }
    currentContent += paraText;
  }

  // Save the last chunk
  if (currentContent.trim()) {
    chunks.push({
      content: currentContent.trimEnd(),
      charStart: currentStart,
      charEnd: text.length,
    });
  }

  return chunks;
}

// ── helpers ──────────────────────────────────────────

interface ParagraphBreak {
  content: string;
  charStart: number;
}

/**
 * Split text into paragraphs by blank lines, then merge Markdown table
 * blocks (starting with **表 N** or containing |...| rows) into single paragraphs.
 */
function splitParagraphs(text: string): ParagraphBreak[] {
  const lines = text.split(/\n/);
  const raw: ParagraphBreak[] = [];
  let charPos = 0;
  let currentPara = "";
  let paraStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineWithNewline = i < lines.length - 1 ? line + "\n" : line;

    if (line.trim() === "") {
      if (currentPara.trim()) {
        raw.push({ content: currentPara, charStart: paraStart });
        currentPara = "";
      }
      charPos += lineWithNewline.length;
      continue;
    }

    if (!currentPara) paraStart = charPos;
    currentPara += lineWithNewline;
    charPos += lineWithNewline.length;
  }

  if (currentPara.trim()) {
    raw.push({ content: currentPara, charStart: paraStart });
  }

  // ── merge adjacent Markdown table lines ──
  return mergeTableParagraphs(raw);
}

/**
 * Detect whether a paragraph block is a Markdown table
 * (starts with **表 N** or contains |---| divider).
 */
function isMarkdownTable(text: string): boolean {
  const lines = text.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("|") && t.endsWith("|")) return true;
    if (/^\*\*表\s+\d+\*\*$/.test(t)) return true;
  }
  return false;
}

/**
 * Merge consecutive table-related paragraphs into one.
 * A table marker (**表 N**) followed by pipe-delimited rows
 * should stay together.
 */
function mergeTableParagraphs(paras: ParagraphBreak[]): ParagraphBreak[] {
  const merged: ParagraphBreak[] = [];
  let i = 0;

  while (i < paras.length) {
    const p = paras[i];

    // Check if this paragraph starts a table
    if (isMarkdownTable(p.content) && i + 1 < paras.length) {
      const next = paras[i + 1];
      if (next.content.trim().startsWith("|")) {
        // Merge table marker + table body
        merged.push({
          content: p.content + next.content,
          charStart: p.charStart,
        });
        i += 2;
        continue;
      }
    }

    // Consecutive pipe-line paragraphs (table split by blank line)
    if (
      p.content.trim().startsWith("|") &&
      merged.length > 0 &&
      isMarkdownTable(merged[merged.length - 1].content)
    ) {
      const last = merged.pop()!;
      merged.push({
        content: last.content + p.content,
        charStart: last.charStart,
      });
      i++;
      continue;
    }

    merged.push(p);
    i++;
  }

  return merged;
}

/**
 * Split an oversized Markdown table: keep header + divider,
 * then split data rows into sub-chunks, each with the header repeated.
 */
function splitOversizedTable(
  tableText: string,
  startPos: number,
  maxSize: number
): TextChunk[] {
  const lines = tableText.split("\n");
  const headerLines: string[] = [];
  const dataLines: string[] = [];
  let inData = false;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("|---") || t.startsWith("| ---")) {
      headerLines.push(line);
      inData = true;
      continue;
    }
    if (!inData && (t.startsWith("**表") || t.startsWith("|"))) {
      headerLines.push(line);
    } else {
      dataLines.push(line);
    }
  }

  const header = headerLines.join("\n") + "\n";
  const headerLength = header.length;

  const chunks: TextChunk[] = [];
  let currentRows = "";
  let currentStart = startPos;
  let posInTable = 0;

  for (const row of dataLines) {
    const rowWithNewline = row + "\n";

    if (currentRows.length + rowWithNewline.length + headerLength > maxSize && currentRows.length > 0) {
      chunks.push({
        content: (header + currentRows).trimEnd(),
        charStart: currentStart,
        charEnd: startPos + posInTable,
      });
      currentRows = rowWithNewline;
      currentStart = startPos + posInTable;
    } else {
      currentRows += rowWithNewline;
    }
    posInTable += rowWithNewline.length;
  }

  if (currentRows.trim()) {
    chunks.push({
      content: (header + currentRows).trimEnd(),
      charStart: currentStart,
      charEnd: startPos + tableText.length,
    });
  }

  return chunks.length > 0 ? chunks : [{ content: tableText, charStart: startPos, charEnd: startPos + tableText.length }];
}

function lastSubChunkText(chunks: TextChunk[]): string | null {
  return chunks.length > 0 ? chunks[chunks.length - 1].content : null;
}

function splitOversizedParagraph(
  paraText: string,
  paraStart: number,
  maxSize: number,
  overlap: number
): TextChunk[] {
  const chunks: TextChunk[] = [];
  const sentences = paraText.split(/(?<=[。！？.!?\n])\s*/);

  let currentContent = "";
  let currentStart = paraStart;
  let posInPara = 0;

  for (const sentence of sentences) {
    if (currentContent.length + sentence.length > maxSize && currentContent.length > 0) {
      chunks.push({
        content: currentContent.trimEnd(),
        charStart: currentStart,
        charEnd: paraStart + posInPara,
      });

      const overlapText = extractOverlap(currentContent, overlap);
      currentContent = overlapText + sentence;
      currentStart = paraStart + posInPara - overlapText.length;
    } else {
      if (!currentContent) currentStart = paraStart + posInPara;
      currentContent += sentence;
    }
    posInPara += sentence.length;
  }

  if (currentContent.trim()) {
    chunks.push({
      content: currentContent.trimEnd(),
      charStart: currentStart,
      charEnd: paraStart + paraText.length,
    });
  }

  return chunks;
}

function extractOverlap(text: string, size: number): string {
  if (size <= 0) return "";
  if (text.length <= size) return text + "\n\n";

  const snippet = text.slice(-size);
  const firstParagraph = snippet.split(/\n\s*\n/)[0];
  if (firstParagraph.length < size / 2) {
    const match = snippet.match(/\n\s*\n/);
    if (match && match.index !== undefined) {
      return snippet.slice(match.index + match[0].length) + "\n\n";
    }
  }

  return snippet + "\n\n";
}
