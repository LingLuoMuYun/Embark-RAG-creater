import { RAG_CONFIG } from "@/server/services/rag/config";
import { buildRetrieveResponse } from "@/server/services/rag/context-builder";
import { mockKnowledgeChunks } from "@/server/services/rag/mock-data";
import type {
  KnowledgeChunk,
  RagRetrieveRequest,
  RagRetrieveResponse,
  RetrievalMode,
} from "@/features/rag/types";

/**
 * RAG 检索主入口。
 *
 * 阶段 1 使用 mock 数据和关键词打分；阶段 2 开始可以把数据来源和打分函数
 * 替换成真实数据库、向量库、BM25、rerank，但对外响应结构保持不变。
 */
export function retrieveRagContexts(
  request: RagRetrieveRequest
): RagRetrieveResponse {
  const scopedChunks = mockKnowledgeChunks.filter((chunk) =>
    isChunkInScope(chunk, request)
  );

  const topK = getTopK(request.mode ?? "balanced");
  const scoredChunks = scopedChunks
    .map((chunk) => ({
      chunk,
      score: calculateMockScore(request.query, chunk),
    }))
    .filter((item) => item.score >= RAG_CONFIG.minScore)
    .sort((a, b) => b.score - a.score)
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

function calculateMockScore(query: string, chunk: KnowledgeChunk): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;

  const title = normalizeText(chunk.title);
  const summary = normalizeText(chunk.summary ?? "");
  const content = normalizeText(chunk.content);
  const metadata = normalizeText(JSON.stringify(chunk.metadata ?? {}));
  const normalizedQuery = normalizeText(query);

  let score = 0;
  if (title.includes(normalizedQuery)) score += 3;
  if (content.includes(normalizedQuery)) score += 2;

  for (const token of tokens) {
    if (title.includes(token)) score += 2;
    if (summary.includes(token)) score += 1.5;
    if (content.includes(token)) score += 1;
    if (metadata.includes(token)) score += 0.5;
  }

  const wikiBoost = chunk.chunkType === "wiki" ? 0.15 : 0;
  return Number((score / tokens.length + wikiBoost).toFixed(4));
}

// 轻量 mock 分词：英文/数字按词，中文按 bigram，保证开发阶段结果稳定可复现。
function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  const asciiTokens = normalized.match(/[a-z0-9_]+/g) ?? [];
  const cjkText = Array.from(normalized)
    .filter((char) => /[\u4e00-\u9fff]/.test(char))
    .join("");
  const cjkTokens: string[] = [];

  if (cjkText.length === 1) {
    cjkTokens.push(cjkText);
  }

  for (let index = 0; index < cjkText.length - 1; index += 1) {
    cjkTokens.push(cjkText.slice(index, index + 2));
  }

  return Array.from(new Set([...asciiTokens, ...cjkTokens]));
}

function normalizeText(input: string): string {
  return input.toLowerCase().trim();
}
