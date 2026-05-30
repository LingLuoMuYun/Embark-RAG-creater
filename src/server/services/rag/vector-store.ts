import { embedChunk, type EmbeddingVector } from "@/server/services/rag/embedding";
import type { KnowledgeChunk } from "@/features/rag/types";

/**
 * 向量检索模块。
 *
 * 职责：
 * 1. 计算 query 向量和 chunk 向量之间的余弦相似度。
 * 2. 在当前候选 chunk 集合上执行内存向量检索。
 * 3. 输出带 rank/source 的结果，供 hybrid 模块与 BM25 结果融合。
 */
export type VectorSearchResult = {
  chunk: KnowledgeChunk;
  score: number;
  rank: number;
  source: "vector";
};

/** 计算两个向量的余弦相似度，向量长度不一致或零向量时返回 0。 */
export function cosineSimilarity(
  queryVector: EmbeddingVector,
  chunkVector: EmbeddingVector
): number {
  if (queryVector.length !== chunkVector.length) return 0;

  let dotProduct = 0;
  let queryMagnitude = 0;
  let chunkMagnitude = 0;

  for (let index = 0; index < queryVector.length; index += 1) {
    const queryValue = queryVector[index];
    const chunkValue = chunkVector[index];
    dotProduct += queryValue * chunkValue;
    queryMagnitude += queryValue * queryValue;
    chunkMagnitude += chunkValue * chunkValue;
  }

  if (queryMagnitude === 0 || chunkMagnitude === 0) return 0;
  return dotProduct / (Math.sqrt(queryMagnitude) * Math.sqrt(chunkMagnitude));
}

/**
 * 在内存中执行向量检索。
 *
 * 当前会现场为每个 chunk 生成 mock embedding；
 * 后续换成真实向量数据库时，保持输入输出结构不变即可。
 */
export function searchByVector(
  chunks: KnowledgeChunk[],
  queryVector: EmbeddingVector
): VectorSearchResult[] {
  return chunks
    .map((chunk) => ({
      chunk,
      score: Number(
        Math.max(0, cosineSimilarity(queryVector, embedChunk(chunk))).toFixed(4)
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      source: "vector" as const,
    }));
}
