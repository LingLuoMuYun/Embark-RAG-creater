import { batchEmbedTexts, cosineSimilarity } from "@/lib/embedding";
import { splitTextIntoChunks, type TextChunk } from "@/lib/text-splitter";

/**
 * 语义分段：
 * 1. 标题硬断 → 2. 拆句子 → 3. 向量化 → 4. 自适应阈值切分 → 5. 短段合并
 * 失败时返回 null，调用方退回机械切分。
 */
export async function splitTextSemantic(
  text: string,
  maxChunkSize = 2000
): Promise<TextChunk[] | null> {
  try {
    // 1. 标题硬断：Markdown 标题强制切分；空行不硬断，后续加权处理
    const sections = splitByHeaders(text);

    const allChunks: TextChunk[] = [];
    let offset = 0;

    for (const section of sections) {
      const sectionChunks = await processSection(section, maxChunkSize);
      for (const c of sectionChunks) {
        allChunks.push({
          content: c.content,
          charStart: offset + c.charStart,
          charEnd: offset + c.charEnd,
        });
      }
      offset += section.length;
    }

    return allChunks.length > 0 ? allChunks : null;
  } catch {
    return null;
  }
}

async function processSection(
  text: string,
  maxChunkSize: number
): Promise<TextChunk[]> {
  // 2. 标记空行位置后拆句子
  const { sentences, blankLineGaps } = splitSentencesWithBlankMark(text);
  if (sentences.length <= 1) {
    return splitTextIntoChunks(text, { maxChunkSize });
  }

  // 3. 批量向量化
  const results = await batchEmbedTexts(sentences);

  // 4. 计算相邻句相似度，空行处打 7 折
  const similarities: number[] = [];
  for (let i = 0; i < results.length - 1; i++) {
    let sim = cosineSimilarity(results[i].embedding, results[i + 1].embedding);
    if (blankLineGaps.has(i)) sim *= 0.7;
    similarities.push(sim);
  }

  if (similarities.length === 0) {
    return splitTextIntoChunks(text, { maxChunkSize });
  }

  // 5. 百分位阈值：低于 40% 分位的相似度处切分
  const sorted = [...similarities].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.4)];
  const breakpointSet = new Set<number>();
  for (let i = 0; i < similarities.length; i++) {
    if (similarities[i] < threshold) {
      breakpointSet.add(i + 1);
    }
  }

  // 6. 按断点拼接句子
  const segments: string[] = [];
  let current = "";
  for (let i = 0; i < sentences.length; i++) {
    current += sentences[i];
    if (breakpointSet.has(i + 1) || i === sentences.length - 1) {
      if (current.trim()) segments.push(current);
      current = "";
    }
  }

  // 7. 短段合并
  const merged = mergeShortSegments(segments);

  // 8. 超长段二次切分
  const chunks: TextChunk[] = [];
  let segOffset = 0;
  for (const seg of merged) {
    const subChunks = splitTextIntoChunks(seg, { maxChunkSize });
    for (const c of subChunks) {
      chunks.push({
        content: c.content,
        charStart: segOffset + c.charStart,
        charEnd: segOffset + c.charEnd,
      });
    }
    segOffset += seg.length;
  }

  return chunks;
}

// ── helpers ──────────────────────────────────────────

/** Markdown 标题处强制切分 */
function splitByHeaders(text: string): string[] {
  const sections: string[] = [];
  const parts = text.split(/(?=^#{1,3}\s)/m);
  for (const part of parts) {
    if (part.trim()) sections.push(part);
  }
  return sections.length > 0 ? sections : [text];
}

function mergeShortSegments(segments: string[]): string[] {
  const result: string[] = [];
  for (const seg of segments) {
    if (seg.length < 20 && result.length > 0) {
      result[result.length - 1] += seg;
    } else {
      result.push(seg);
    }
  }
  return result;
}

function splitSentencesWithBlankMark(
  text: string
): { sentences: string[]; blankLineGaps: Set<number> } {
  // 先按空行分块，块内再拆句；块间视为有空行分隔
  const blocks = text.split(/\n\n+/);
  const sentences: string[] = [];
  const blankLineGaps = new Set<number>();

  for (const block of blocks) {
    const raw = block.split(
      /(?<=[。！？\n])\s*|(?<!\d)(?<=[.!?])\s+(?=[A-Z一-鿿])/u
    );
    const blockSentences = raw
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (blockSentences.length === 0) continue;

    if (sentences.length > 0) {
      blankLineGaps.add(sentences.length - 1); // 前一块末句 → 当前块首句之间有空白行
    }
    sentences.push(...blockSentences);
  }

  return { sentences, blankLineGaps };
}
