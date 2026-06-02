import { embedChunk, type EmbeddingVector } from "@/server/services/rag/embedding";
import type { KnowledgeChunk } from "@/features/rag/types";

export type VectorSearchResult = {
  chunk: KnowledgeChunk;
  score: number;
  rank: number;
  source: "vector";
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

function getStoredEmbedding(chunk: KnowledgeChunk): EmbeddingVector | undefined {
  const value = chunk.metadata?.embedding;
  if (typeof value !== "string") return undefined;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter((item): item is number => typeof item === "number");
  } catch {
    return undefined;
  }
}

export async function searchByVector(
  chunks: KnowledgeChunk[],
  queryVector: EmbeddingVector
): Promise<VectorSearchResult[]> {
  const scoredResults = chunks.map((chunk) => {
    const embedding = getStoredEmbedding(chunk) ?? embedChunk(chunk);

    return {
      chunk,
      score: Number(
        Math.max(0, cosineSimilarity(queryVector, embedding)).toFixed(4)
      ),
    };
  });

  return scoredResults
    .sort((a, b) => b.score - a.score)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      source: "vector" as const,
    }));
}
