import { prisma } from "@/lib/db";
import {
  getDocumentById,
  getDocumentChunks,
} from "@/server/services/document.service";
import {
  extractKnowledge,
  deduplicateCandidates,
  type ExtractResult,
} from "@/lib/ai-extract";
import { renderChunkUserPrompt } from "@/lib/prompts/extraction";
import type { CandidateKnowledgeItem } from "@/features/extraction/extraction.validation";
import { indexChunks } from "@/server/services/rag/vector-index-repository";
import type { KnowledgeChunk } from "@/features/rag/types";

// ===== 类型 =====

export interface KnowledgeChunkRow {
  id: string;
  documentSourceId: string | null;
  title: string | null;
  content: string;
  suggestedCategory: string | null;
  suggestedTags: string | null;
  chunkType: string;
  knowledgeType: string | null;
  reviewStatus: string | null;
  chunkStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtractionFromDocumentResult {
  documentId: string;
  documentName: string;
  totalChunks: number;
  rawCandidateCount: number;
  dedupedCandidateCount: number;
  candidates: KnowledgeChunkRow[];
  errors?: Array<{ chunkIndex: number; error: string }>;
}

// ===== 辅助函数 =====

function toKnowledgeChunkData(
  item: CandidateKnowledgeItem,
  documentSourceId: string,
  baseIndex = 0
) {
  const tagsJson = JSON.stringify(item.suggestedTags || []);
  return {
    documentSourceId,
    content: item.content,
    title: item.title,
    chunkType: "knowledge",
    knowledgeType: item.type,
    suggestedCategory: item.suggestedCategory || null,
    suggestedTags: tagsJson === "[]" ? null : tagsJson,
    reviewStatus: "pending",
    chunkStatus: "disabled",
    chunkIndex: baseIndex,
    charStart: 0,
    charEnd: item.content.length,
  };
}

// ===== 从文本提炼 =====

export async function extractFromText(
  text: string
): Promise<ExtractResult> {
  return extractKnowledge(text);
}

// ===== 从文档提炼 =====

export async function extractFromDocument(
  documentId: string
): Promise<{
  success: boolean;
  data?: ExtractionFromDocumentResult;
  error?: { code: string; message: string };
}> {
  // 1. 获取文档信息并校验状态
  const doc = await getDocumentById(documentId);
  if (!doc) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "文档不存在" },
    };
  }
  if (doc.status !== "parsed") {
    return {
      success: false,
      error: {
        code: "INVALID_STATUS",
        message: `文档尚未解析完成，当前状态: ${doc.status}`,
      },
    };
  }

  // 2. 获取分段
  const chunks = await getDocumentChunks(documentId);
  if (!chunks || chunks.length === 0) {
    return {
      success: false,
      error: {
        code: "EMPTY_DOCUMENT",
        message: "该文档没有可提炼的内容（分段为空）",
      },
    };
  }

  // 3. 逐段提炼
  const allCandidates: CandidateKnowledgeItem[] = [];
  const errors: Array<{ chunkIndex: number; error: string }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const contextualizedText = renderChunkUserPrompt(
        chunk.content,
        doc.originalName,
        chunk.chunkIndex,
        chunks.length
      );

      const result = await extractKnowledge(contextualizedText);

      if (
        result.success &&
        result.candidates &&
        result.candidates.length > 0
      ) {
        allCandidates.push(...result.candidates);
      }
    } catch (err: unknown) {
      errors.push({
        chunkIndex: chunk.chunkIndex,
        error: err instanceof Error ? err.message : "提炼失败",
      });
    }
  }

  // 4. 检查是否全部失败
  if (allCandidates.length === 0) {
    return {
      success: false,
      error: {
        code: "EXTRACTION_FAILED",
        message:
          errors.length === chunks.length
            ? "所有分段提炼均失败，可能是文档内容不适合提炼或 LLM 服务异常"
            : `提炼失败: ${errors.map((e) => `第${e.chunkIndex + 1}段: ${e.error}`).join("; ")}`,
      },
    };
  }

  // 5. 去重
  const deduped = deduplicateCandidates(allCandidates);

  // 6. 获取该文档下 knowledge 类型 chunk 的最大 chunkIndex
  const maxKnowledgeChunk = await prisma.documentChunk.findFirst({
    where: { documentSourceId: documentId, chunkType: "knowledge" },
    orderBy: { chunkIndex: "desc" },
    select: { chunkIndex: true },
  });
  let baseIndex = (maxKnowledgeChunk?.chunkIndex ?? -1) + 1;

  // 7. 写入 DocumentChunk（替代旧的 CandidateKnowledge）
  const rows = deduped.map((item) => {
    const data = toKnowledgeChunkData(item, documentId, baseIndex);
    baseIndex += 1;
    return data;
  });
  await prisma.documentChunk.createMany({ data: rows });

  // 8. 查询刚写入的记录返回
  const saved = await prisma.documentChunk.findMany({
    where: {
      documentSourceId: documentId,
      chunkType: "knowledge",
      reviewStatus: "pending",
    },
    orderBy: { createdAt: "desc" },
    take: deduped.length,
  });

  return {
    success: true,
    data: {
      documentId,
      documentName: doc.originalName,
      totalChunks: chunks.length,
      rawCandidateCount: allCandidates.length,
      dedupedCandidateCount: deduped.length,
      candidates: saved.map((c) => ({
        id: c.id,
        documentSourceId: c.documentSourceId,
        title: c.title,
        content: c.content,
        suggestedCategory: c.suggestedCategory,
        suggestedTags: c.suggestedTags,
        chunkType: c.chunkType,
        knowledgeType: c.knowledgeType,
        reviewStatus: c.reviewStatus,
        chunkStatus: c.chunkStatus,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}

// ===== 候选知识 CRUD（操作 DocumentChunk where chunkType="knowledge"） =====

function knowledgeWhere() {
  return { chunkType: "knowledge" } as const;
}

export async function listCandidates() {
  const items = await prisma.documentChunk.findMany({
    where: { chunkType: "knowledge", reviewStatus: "pending" },
    orderBy: { createdAt: "desc" },
  });
  return items.map(mapKnowledgeChunkToCandidate);
}

export async function getCandidateById(id: string) {
  return prisma.documentChunk.findFirst({
    where: { id, chunkType: "knowledge" },
  });
}

export async function deleteCandidateById(id: string) {
  const existing = await prisma.documentChunk.findFirst({
    where: { id, chunkType: "knowledge" },
  });
  if (!existing) return null;
  await prisma.documentChunk.update({
    where: { id },
    data: { reviewStatus: "rejected", chunkStatus: "disabled" },
  });
  return existing;
}

export async function listCandidatesByDocument(
  documentSourceId: string
) {
  const items = await prisma.documentChunk.findMany({
    where: { documentSourceId, chunkType: "knowledge" },
    orderBy: { createdAt: "desc" },
  });
  return items.map(mapKnowledgeChunkToCandidate);
}

export async function updateCandidate(
  id: string,
  data: {
    title?: string;
    content?: string;
    suggestedCategory?: string | null;
    suggestedTags?: string[];
    type?: string;
  }
) {
  const existing = await prisma.documentChunk.findFirst({
    where: { id, chunkType: "knowledge" },
  });
  if (!existing) return null;

  return prisma.documentChunk.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.content !== undefined && { content: data.content }),
      ...(data.suggestedCategory !== undefined && {
        suggestedCategory: data.suggestedCategory,
      }),
      ...(data.suggestedTags !== undefined && {
        suggestedTags: JSON.stringify(data.suggestedTags),
      }),
      ...(data.type !== undefined && {
        knowledgeType: data.type,
      }),
      updatedAt: new Date(),
    },
  });
}

// ===== 确认入库（生成 embedding） =====

export async function confirmCandidates(ids: string[], knowledgeBaseIds: string[]) {
  // 1. 更新状态为 confirmed + active
  await prisma.documentChunk.updateMany({
    where: {
      id: { in: ids },
      chunkType: "knowledge",
      reviewStatus: "pending",
    },
    data: {
      reviewStatus: "confirmed",
      chunkStatus: "active",
      updatedAt: new Date(),
    },
  });

  // 2. 查询更新后的 chunks 用于生成 embedding
  const confirmedChunks = await prisma.documentChunk.findMany({
    where: {
      id: { in: ids },
      chunkType: "knowledge",
      reviewStatus: "confirmed",
    },
    include: {
      documentSource: {
        include: { knowledgeBases: true },
      },
    },
  });

  // 3. 确保文档已绑定到选中的知识库（跳过已存在的关联）
  const docIds = [...new Set(confirmedChunks.map((c) => c.documentSourceId).filter((id): id is string => id !== null))];
  if (docIds.length > 0) {
    const existingRelations = await prisma.knowledgeBaseDocument.findMany({
      where: {
        documentId: { in: docIds },
        knowledgeBaseId: { in: knowledgeBaseIds },
      },
      select: { documentId: true, knowledgeBaseId: true },
    });
    const existingPairs = new Set(
      existingRelations.map((r) => `${r.documentId}:${r.knowledgeBaseId}`)
    );
    const missingPairs: { documentId: string; knowledgeBaseId: string }[] = [];
    for (const docId of docIds) {
      for (const kbId of knowledgeBaseIds) {
        if (!existingPairs.has(`${docId}:${kbId}`)) {
          missingPairs.push({ documentId: docId, knowledgeBaseId: kbId });
        }
      }
    }
    if (missingPairs.length > 0) {
      await prisma.knowledgeBaseDocument.createMany({ data: missingPairs });
    }
  }

  // 4. 映射为 RAG KnowledgeChunk 域类型并生成 embedding
  if (confirmedChunks.length > 0) {
    const ragChunks: KnowledgeChunk[] = confirmedChunks.map((chunk) => ({
      id: chunk.id,
      knowledgeBaseId: knowledgeBaseIds[0],
      knowledgeId: chunk.documentSourceId ?? chunk.id,
      title: chunk.title ?? chunk.documentSource?.title ?? "",
      content: chunk.content,
      summary: chunk.title ?? undefined,
      status: "available",
      sourceType: "import",
      chunkType: "summary",
      chunkIndex: chunk.chunkIndex,
      metadata: {
        suggestedCategory: chunk.suggestedCategory,
        suggestedTags: chunk.suggestedTags,
        reviewStatus: chunk.reviewStatus,
      },
      createdAt: chunk.createdAt.toISOString(),
      updatedAt: chunk.updatedAt.toISOString(),
    }));

    await indexChunks(ragChunks);
  }

  return confirmedChunks.length;
}

// ===== 映射辅助 =====

function mapKnowledgeChunkToCandidate(c: {
  id: string;
  documentSourceId: string | null;
  title: string | null;
  content: string;
  suggestedCategory: string | null;
  suggestedTags: string | null;
  chunkType: string;
  knowledgeType: string | null;
  reviewStatus: string | null;
  chunkStatus: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  let suggestedTags: string[] = [];
  try {
    suggestedTags = c.suggestedTags ? JSON.parse(c.suggestedTags) : [];
  } catch {
    suggestedTags = [];
  }

  // Use stored knowledgeType from AI extraction, fallback to chunkType
  const type = c.knowledgeType || (c.chunkType === "knowledge" ? "concept" : c.chunkType);

  return {
    id: c.id,
    title: c.title ?? c.content.slice(0, 50),
    content: c.content,
    suggested_category: c.suggestedCategory,
    suggested_tags: suggestedTags,
    type,
    status: c.reviewStatus ?? c.chunkStatus,
    documentSourceId: c.documentSourceId,
    created_at: c.createdAt.toISOString(),
  };
}
