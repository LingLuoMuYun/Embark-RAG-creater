import { RAG_CONFIG } from "@/server/services/rag/config";
import type {
  KnowledgeChunk,
  RagContext,
  RagReference,
  RagRetrieveResponse,
} from "@/features/rag/types";

/**
 * 检索结果上下文构建模块。
 *
 * 职责：
 * 1. 把检索命中的 chunk 转成结构化 contexts。
 * 2. 生成可直接交给 LLM 的 llmContext。
 * 3. 生成 references，并保证 refId 与 llmContext 中的 [ref_n] 对齐。
 */
export type ScoredKnowledgeChunk = {
  chunk: KnowledgeChunk;
  score: number;
};

/**
 * 把检索命中的 chunk 整理成对外响应。
 *
 * contexts 给调用方做结构化处理，llmContext 可直接拼进 prompt，
 * references 用于把 [ref_n] 映射回来源知识。
 */
export function buildRetrieveResponse(
  query: string,
  scoredChunks: ScoredKnowledgeChunk[]
): RagRetrieveResponse {
  const contexts: RagContext[] = [];
  const references: RagReference[] = [];
  const llmContextParts: string[] = [];
  let usedChars = 0;

  for (const { chunk, score } of scoredChunks) {
    const refId = `ref_${contexts.length + 1}`;
    const header = `[${refId}] ${chunk.title}\n`;
    const separator = llmContextParts.length > 0 ? "\n\n" : "";
    const remaining =
      RAG_CONFIG.maxContextChars - usedChars - separator.length - header.length;

    if (remaining <= 0) break;

    // 初版先按字符预算截断，后续接入 tokenizer 后可以替换为 token 预算。
    const content =
      chunk.content.length > remaining
        ? chunk.content.slice(0, remaining)
        : chunk.content;

    if (!content.trim()) continue;

    const context: RagContext = {
      id: `ctx_${chunk.id}`,
      knowledgeBaseId: chunk.knowledgeBaseId,
      knowledgeId: chunk.knowledgeId,
      chunkId: chunk.id,
      title: chunk.title,
      content,
      chunkType: chunk.chunkType,
      score,
      categoryId: chunk.categoryId,
      tagIds: chunk.tagIds,
      metadata: chunk.metadata,
    };

    contexts.push(context);
    references.push({
      refId,
      knowledgeBaseId: chunk.knowledgeBaseId,
      knowledgeId: chunk.knowledgeId,
      chunkId: chunk.id,
      title: chunk.title,
      chunkType: chunk.chunkType,
    });

    const llmContextPart = `${header}${content}`;
    llmContextParts.push(llmContextPart);
    usedChars += separator.length + llmContextPart.length;
  }

  return {
    query,
    contexts,
    llmContext: llmContextParts.join("\n\n"),
    references,
  };
}
