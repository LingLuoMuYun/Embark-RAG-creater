import { embedChunk, type EmbeddingVector } from "@/server/services/rag/embedding";
import type { KnowledgeChunk } from "@/features/rag/types";

export type VectorSearchResult = {
  chunk: KnowledgeChunk;
  score: number;
};

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
 * 阶段 1/2 的内存向量检索。
 *
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
    .sort((a, b) => b.score - a.score);
}
