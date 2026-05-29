// Text splitter: merge paragraphs up to maxSize, split at paragraph boundaries.
// Preserves context for downstream AI extraction.

export interface ChunkConfig {
  maxChunkSize?: number;  // default 2000
  overlapSize?: number;   // default 200
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

    // If adding this paragraph would exceed maxSize, save current chunk first
    if (currentContent.length + paraText.length > maxSize && currentContent.length > 0) {
      chunks.push({
        content: currentContent.trimEnd(),
        charStart: currentStart,
        charEnd: para.charStart,
      });

      // Start new chunk with overlap from previous chunk
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

      const subChunks = splitOversizedParagraph(
        paraText,
        para.charStart,
        maxSize,
        overlap
      );
      chunks.push(...subChunks);

      // Start fresh after oversized paragraph
      currentContent = extractOverlap(paraText, overlap);
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

function splitParagraphs(text: string): ParagraphBreak[] {
  const paragraphs: ParagraphBreak[] = [];
  const lines = text.split(/\n/);
  let charPos = 0;
  let currentPara = "";
  let paraStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineWithNewline = i < lines.length - 1 ? line + "\n" : line;

    if (line.trim() === "") {
      if (currentPara.trim()) {
        paragraphs.push({ content: currentPara, charStart: paraStart });
        currentPara = "";
      }
      charPos += lineWithNewline.length;
      continue;
    }

    if (!currentPara) {
      paraStart = charPos;
    }
    currentPara += lineWithNewline;
    charPos += lineWithNewline.length;
  }

  if (currentPara.trim()) {
    paragraphs.push({ content: currentPara, charStart: paraStart });
  }

  return paragraphs;
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
      if (!currentContent) {
        currentStart = paraStart + posInPara;
      }
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
