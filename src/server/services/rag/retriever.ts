import { RAG_CONFIG } from "@/server/services/rag/config";
import { searchByBm25 } from "@/server/services/rag/bm25";
import { buildRetrieveResponse } from "@/server/services/rag/context-builder";
import { listKnowledgeChunks } from "@/server/services/rag/chunk-repository";
import { embedQuery } from "@/server/services/rag/embedding";
import { fuseByRrf } from "@/server/services/rag/hybrid";
import { searchByVector } from "@/server/services/rag/vector-store";
import type {
  KnowledgeChunk,
  RagRetrieveRequest,
  RagRetrieveResponse,
  RetrievalMode,
} from "@/features/rag/types";

/**
 * RAG 检索编排模块。
 *
 * 职责：
 * 1. 读取候选知识片段并应用 scope/status 过滤。
 * 2. 并行执行向量检索和 BM25 关键词检索。
 * 3. 使用 RRF 融合多路召回结果。
 * 4. 将最终结果交给 context-builder 组装成对外响应。
 */
export async function retrieveRagContexts(
  request: RagRetrieveRequest
): Promise<RagRetrieveResponse> {
  const chunks = await listKnowledgeChunks(request.scope);
  const scopedChunks = chunks.filter((chunk) =>
    isChunkInScope(chunk, request)
  );

  const topK = getTopK(request.mode ?? "balanced");
  const candidateLimit = topK * RAG_CONFIG.candidateMultiplier;
  const queryVector = embedQuery(request.query);
  const vectorResults = searchByVector(scopedChunks, queryVector)
    .filter((item) => item.score >= RAG_CONFIG.minScore)
    .slice(0, candidateLimit);
  const bm25Results = searchByBm25(scopedChunks, request.query).slice(
    0,
    candidateLimit
  );
  const scoredChunks = fuseByRrf([vectorResults, bm25Results]).slice(0, topK);

  return buildRetrieveResponse(request.query, scoredChunks);
}

/** 根据 Agent 传入的 scope 和知识状态过滤可参与检索的 chunk。 */
function isChunkInScope(
  chunk: KnowledgeChunk,
  request: RagRetrieveRequest
): boolean {
  const { scope } = request;

  if (chunk.status !== "available") return false;
  if (!scope.knowledgeBaseIds.includes(chunk.knowledgeBaseId)) return false;
  if (scope.knowledgeIds && !scope.knowledgeIds.includes(chunk.knowledgeId)) {
    return false;
  }
  if (scope.categoryIds && !scope.categoryIds.includes(chunk.categoryId ?? "")) {
    return false;
  }
  if (scope.chunkTypes && !scope.chunkTypes.includes(chunk.chunkType)) {
    return false;
  }
  // tagIds 初版采用“任意标签命中”语义，后续如需“全部命中”要同步修改对接文档。
  if (scope.tagIds && !hasAnyTag(chunk.tagIds, scope.tagIds)) {
    return false;
  }

  return true;
}

/** tagIds 初版采用“任意标签命中”语义。 */
function hasAnyTag(chunkTagIds: string[] | undefined, scopeTagIds: string[]) {
  if (!chunkTagIds || chunkTagIds.length === 0) return false;
  return scopeTagIds.some((tagId) => chunkTagIds.includes(tagId));
}

/** 根据 mode 决定最终返回给下游的结果数量。 */
function getTopK(mode: RetrievalMode): number {
  if (mode === "fast") return RAG_CONFIG.fastTopK;
  if (mode === "detailed") return RAG_CONFIG.detailedTopK;
  return RAG_CONFIG.topK;
}
