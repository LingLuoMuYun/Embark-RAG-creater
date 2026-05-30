import { RAG_CONFIG } from "@/server/services/rag/config";
import { buildRetrieveResponse } from "@/server/services/rag/context-builder";
import { listKnowledgeChunks } from "@/server/services/rag/chunk-repository";
import { embedQuery } from "@/server/services/rag/embedding";
import { searchByVector } from "@/server/services/rag/vector-store";
import type {
  KnowledgeChunk,
  RagRetrieveRequest,
  RagRetrieveResponse,
  RetrievalMode,
} from "@/features/rag/types";

/**
 * RAG 检索主入口。
 *
 * 阶段 1/2 使用 repository + mock embedding + 内存向量检索；
 * 后续可以把 repository 和 vector-store 替换成真实数据库/向量库。
 */
export async function retrieveRagContexts(
  request: RagRetrieveRequest
): Promise<RagRetrieveResponse> {
  const chunks = await listKnowledgeChunks(request.scope);
  const scopedChunks = chunks.filter((chunk) =>
    isChunkInScope(chunk, request)
  );

  const topK = getTopK(request.mode ?? "balanced");
  const queryVector = embedQuery(request.query);
  const scoredChunks = searchByVector(scopedChunks, queryVector)
    .filter((item) => item.score >= RAG_CONFIG.minScore)
    .slice(0, topK);

  return buildRetrieveResponse(request.query, scoredChunks);
}

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

function hasAnyTag(chunkTagIds: string[] | undefined, scopeTagIds: string[]) {
  if (!chunkTagIds || chunkTagIds.length === 0) return false;
  return scopeTagIds.some((tagId) => chunkTagIds.includes(tagId));
}

function getTopK(mode: RetrievalMode): number {
  if (mode === "fast") return RAG_CONFIG.fastTopK;
  if (mode === "detailed") return RAG_CONFIG.detailedTopK;
  return RAG_CONFIG.topK;
}
