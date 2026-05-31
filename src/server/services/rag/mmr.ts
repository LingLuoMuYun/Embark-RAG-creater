import { RAG_CONFIG } from "@/server/services/rag/config";
import { embedChunk, type EmbeddingVector } from "@/server/services/rag/embedding";
import type { RankedRetrievalResult } from "@/server/services/rag/hybrid";
import { cosineSimilarity } from "@/server/services/rag/vector-store";

type MmrCandidate = {
  result: RankedRetrievalResult;
  relevance: number;
  embedding: EmbeddingVector;
};

/**
 * MMR 去冗余模块。
 *
 * 职责：
 * 1. 在 RRF 融合结果上保留高相关候选。
 * 2. 用 chunk embedding 相似度惩罚已选结果的重复内容。
 * 3. 输出重新排序后的 anchor chunk，供后续上下文扩展使用。
 */
export function selectByMmr(
  results: RankedRetrievalResult[],
  limit: number
): RankedRetrievalResult[] {
  if (limit <= 0 || results.length === 0) return [];

  if (!RAG_CONFIG.mmrEnabled) {
    return rerank(results.slice(0, limit));
  }

  const candidates = toMmrCandidates(results);
  const selected: MmrCandidate[] = [];
  const remaining = [...candidates];
  const selectionLimit = Math.min(limit, candidates.length);

  while (selected.length < selectionLimit && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const redundancy = getMaxSimilarity(candidate.embedding, selected);
      const mmrScore =
        RAG_CONFIG.mmrLambda * candidate.relevance -
        (1 - RAG_CONFIG.mmrLambda) * redundancy;

      if (
        isBetterCandidate(candidate, mmrScore, remaining[bestIndex], bestScore)
      ) {
        bestIndex = index;
        bestScore = mmrScore;
      }
    }

    const [bestCandidate] = remaining.splice(bestIndex, 1);
    selected.push(bestCandidate);
  }

  return rerank(selected.map((candidate) => candidate.result));
}

function toMmrCandidates(results: RankedRetrievalResult[]): MmrCandidate[] {
  const scores = results.map((result) => result.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const scoreRange = maxScore - minScore;

  return results.map((result) => ({
    result,
    relevance: scoreRange === 0 ? 1 : (result.score - minScore) / scoreRange,
    embedding: embedChunk(result.chunk),
  }));
}

function getMaxSimilarity(
  embedding: EmbeddingVector,
  selected: MmrCandidate[]
): number {
  if (selected.length === 0) return 0;

  return Math.max(
    ...selected.map((candidate) =>
      Math.max(0, cosineSimilarity(embedding, candidate.embedding))
    )
  );
}

function isBetterCandidate(
  candidate: MmrCandidate,
  candidateScore: number,
  currentBest: MmrCandidate,
  currentBestScore: number
): boolean {
  if (candidateScore !== currentBestScore) {
    return candidateScore > currentBestScore;
  }
  if (candidate.relevance !== currentBest.relevance) {
    return candidate.relevance > currentBest.relevance;
  }

  return candidate.result.rank < currentBest.result.rank;
}

function rerank(results: RankedRetrievalResult[]): RankedRetrievalResult[] {
  return results.map((result, index) => ({
    ...result,
    rank: index + 1,
  }));
}
