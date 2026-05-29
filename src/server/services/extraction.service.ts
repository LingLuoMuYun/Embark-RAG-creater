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

// ===== 类型 =====

export interface CandidateRow {
  id: string;
  title: string;
  content: string;
  suggestedCategory: string | null;
  suggestedTags: string | null;
  type: string;
  status: string;
  documentSourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExtractionFromDocumentResult {
  documentId: string;
  documentName: string;
  totalChunks: number;
  rawCandidateCount: number;
  dedupedCandidateCount: number;
  candidates: CandidateRow[];
  errors?: Array<{ chunkIndex: number; error: string }>;
}

// ===== 辅助函数 =====

function toCandidateRow(
  item: CandidateKnowledgeItem,
  status = "pending",
  documentSourceId?: string
) {
  return {
    title: item.title,
    content: item.content,
    suggestedCategory: item.suggestedCategory || null,
    suggestedTags: JSON.stringify(item.suggestedTags || []),
    type: item.type,
    status,
    ...(documentSourceId ? { documentSourceId } : {}),
  };
}

// ===== 从文本提炼 =====

export async function extractFromText(
  text: string
): Promise<ExtractResult> {
  return extractKnowledge(text);
}

// ===== 从文档提炼（对接 C 的解析结果） =====

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

  // 6. 写入 candidates 表
  const rows = deduped.map((item) =>
    toCandidateRow(item, "pending", documentId)
  );
  await prisma.candidateKnowledge.createMany({ data: rows });

  // 7. 查询刚写入的记录返回
  const saved = await prisma.candidateKnowledge.findMany({
    where: { documentSourceId: documentId, status: "pending" },
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
        ...c,
        suggestedCategory: c.suggestedCategory,
        suggestedTags: c.suggestedTags,
      })),
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}

// ===== 候选知识 CRUD =====

export async function listCandidates() {
  const items = await prisma.candidateKnowledge.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  return items.map((c) => ({
    id: c.id,
    title: c.title,
    content: c.content,
    suggested_category: c.suggestedCategory,
    suggested_tags: JSON.parse(c.suggestedTags || "[]"),
    type: c.type,
    status: c.status,
    documentSourceId: c.documentSourceId,
    created_at: c.createdAt.toISOString(),
  }));
}

export async function getCandidateById(id: string) {
  return prisma.candidateKnowledge.findUnique({ where: { id } });
}

export async function deleteCandidateById(id: string) {
  const existing = await prisma.candidateKnowledge.findUnique({
    where: { id },
  });
  if (!existing) return null;
  await prisma.candidateKnowledge.delete({ where: { id } });
  return existing;
}

// ===== 确认入库 =====

export async function confirmCandidates(ids: string[]) {
  const result = await prisma.candidateKnowledge.updateMany({
    where: { id: { in: ids }, status: "pending" },
    data: { status: "confirmed", updatedAt: new Date() },
  });
  return result.count;
}
