import { batchEmbedTexts, cosineSimilarity } from "@/lib/embedding";
import { splitTextIntoChunks, type TextChunk } from "@/lib/text-splitter";

/**
 * 用 embedding 向量做语义分段：
 * 1. 拆句子 → 2. 批量向量化 → 3. 相邻相似度 → 4. 低谷处切分
 * 失败时返回 null，调用方退回机械切分。
 */
export async function splitTextSemantic(
  text: string,
  maxChunkSize = 2000
): Promise<TextChunk[] | null> {
  try {
    // 1. 拆成句子
    const sentences = splitSentences(text);
    if (sentences.length <= 1) return null;

    // 2. 批量向量化
    const results = await batchEmbedTexts(sentences);

    // 3. 计算相邻相似度，找切分点
    const similarities: number[] = [];
    for (let i = 0; i < results.length - 1; i++) {
      similarities.push(
        cosineSimilarity(results[i].embedding, results[i + 1].embedding)
      );
    }

    // 4. 用百分位阈值找低谷（低于 50% 分位的视为断点）
    if (similarities.length === 0) return null;
    const sorted = [...similarities].sort((a, b) => a - b);
    const threshold = sorted[Math.floor(sorted.length * 0.5)];

    const breakpoints = new Set<number>();
    for (let i = 0; i < similarities.length; i++) {
      if (similarities[i] < threshold) {
        breakpoints.add(i + 1); // 在句子 i 之后切
      }
    }

    // 5. 按断点拼接句子为 segment
    const segments: string[] = [];
    let current = "";
    for (let i = 0; i < sentences.length; i++) {
      current += sentences[i];
      if (breakpoints.has(i + 1) || i === sentences.length - 1) {
        if (current.trim()) segments.push(current);
        current = "";
      }
    }

    // 6. 每个 segment 如果还超长，递归段落切分
    const allChunks: TextChunk[] = [];
    let offset = 0;
    for (const seg of segments) {
      const segChunks = splitTextIntoChunks(seg, { maxChunkSize });
      for (const c of segChunks) {
        allChunks.push({
          content: c.content,
          charStart: offset + c.charStart,
          charEnd: offset + c.charEnd,
        });
      }
      offset += seg.length;
    }

    return allChunks.length > 0 ? allChunks : null;
  } catch {
    return null;
  }
}

function splitSentences(text: string): string[] {
  // 句末标点切分：中文标点直接切，英文 .!? 需非数字前导（避免 1. 2. 序号被误切）
  const raw = text.split(
    /(?<=[。！？\n])\s*|(?<!\d)(?<=[.!?])\s+(?=[A-Z一-鿿])/u
  );
  return raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
