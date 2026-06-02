import { prisma } from "@/lib/db";
import {
  getDocumentById,
  getDocumentChunks,
} from "@/server/services/document.service";
import {
  deduplicateCandidates,
  extractKnowledge,
  type ExtractResult,
} from "@/lib/ai-extract";
import { renderChunkUserPrompt } from "@/lib/prompts/extraction";
import type { ExtractedChunk } from "@/features/extraction/extraction.validation";

export type ExtractedDocumentChunk = {
  id: string;
  documentSourceId: string;
  content: string;
  category: string | null;
  type: string;
  status: string;
  chunkIndex: number;
  createdAt: string;
  updatedAt: string;
};

export interface ExtractionFromDocumentResult {
  documentId: string;
  documentName: string;
  totalChunks: number;
  rawCandidateCount: number;
  dedupedCandidateCount: number;
  chunks: ExtractedDocumentChunk[];
  errors?: Array<{ chunkIndex: number; error: string }>;
}

function getChunkCategory(item: ExtractedChunk): string | null {
  return item.category ?? item.suggestedCategory ?? null;
}

function toExtractedDocumentChunk(chunk: {
  id: string;
  documentSourceId: string;
  content: string;
  category: string | null;
  type: string;
  status: string;
  chunkIndex: number;
  createdAt: Date;
  updatedAt: Date;
}): ExtractedDocumentChunk {
  return {
    id: chunk.id,
    documentSourceId: chunk.documentSourceId,
    content: chunk.content,
    category: chunk.category,
    type: chunk.type,
    status: chunk.status,
    chunkIndex: chunk.chunkIndex,
    createdAt: chunk.createdAt.toISOString(),
    updatedAt: chunk.updatedAt.toISOString(),
  };
}

export async function extractFromText(text: string): Promise<ExtractResult> {
  return extractKnowledge(text);
}

export async function createAiDocumentFromText(
  text: string,
  extractedChunks: ExtractedChunk[]
) {
  return prisma.$transaction(async (tx) => {
    const document = await tx.documentSource.create({
      data: {
        title: "AI 提炼文本",
        sourceType: "ai",
        originalName: "AI 提炼文本",
        content: text,
        rawContent: text,
        status: "parsed",
        parseStatus: "success",
        chunkCount: extractedChunks.length,
        chunks:
          extractedChunks.length > 0
            ? {
                create: extractedChunks.map((chunk, index) => ({
                  chunkIndex: index,
                  content: chunk.content,
                  category: getChunkCategory(chunk),
                  type: chunk.type,
                  status: "active",
                  embedding: null,
                })),
              }
            : undefined,
      },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
        },
      },
    });

    return {
      document,
      chunks: document.chunks.map(toExtractedDocumentChunk),
    };
  });
}

export async function extractFromDocument(
  documentId: string
): Promise<{
  success: boolean;
  data?: ExtractionFromDocumentResult;
  error?: { code: string; message: string };
}> {
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

  const chunks = await getDocumentChunks(documentId);
  if (chunks.length === 0) {
    return {
      success: false,
      error: {
        code: "EMPTY_DOCUMENT",
        message: "该文档没有可提炼的内容",
      },
    };
  }

  const allExtracted: ExtractedChunk[] = [];
  const errors: Array<{ chunkIndex: number; error: string }> = [];

  for (const chunk of chunks) {
    try {
      const contextualizedText = renderChunkUserPrompt(
        chunk.content,
        doc.title ?? doc.originalName ?? doc.fileName ?? "未命名文档",
        chunk.chunkIndex,
        chunks.length
      );
      const result = await extractKnowledge(contextualizedText);

      if (result.success && result.candidates?.length) {
        allExtracted.push(...result.candidates);
      }
    } catch (error) {
      errors.push({
        chunkIndex: chunk.chunkIndex,
        error: error instanceof Error ? error.message : "提炼失败",
      });
    }
  }

  if (allExtracted.length === 0) {
    return {
      success: false,
      error: {
        code: "EXTRACTION_FAILED",
        message:
          errors.length === chunks.length
            ? "所有分段提炼均失败"
            : `提炼失败: ${errors.map((error) => `第 ${error.chunkIndex + 1} 段 ${error.error}`).join("; ")}`,
      },
    };
  }

  const deduped = deduplicateCandidates(allExtracted);
  const baseChunk = await prisma.documentChunk.findFirst({
    where: { documentSourceId: documentId },
    orderBy: { chunkIndex: "desc" },
    select: { chunkIndex: true },
  });
  const baseChunkIndex = (baseChunk?.chunkIndex ?? -1) + 1;

  const saved = await prisma.$transaction(async (tx) => {
    await tx.documentChunk.createMany({
      data: deduped.map((chunk, index) => ({
        documentSourceId: documentId,
        chunkIndex: baseChunkIndex + index,
        content: chunk.content,
        category: getChunkCategory(chunk),
        type: chunk.type,
        status: "active",
        embedding: null,
      })),
    });

    const nextChunks = await tx.documentChunk.findMany({
      where: {
        documentSourceId: documentId,
        chunkIndex: { gte: baseChunkIndex },
      },
      orderBy: { chunkIndex: "asc" },
    });

    await tx.documentSource.update({
      where: { id: documentId },
      data: {
        chunkCount: baseChunkIndex + deduped.length,
      },
    });

    return nextChunks;
  });

  return {
    success: true,
    data: {
      documentId,
      documentName: doc.title ?? doc.originalName ?? doc.fileName ?? "未命名文档",
      totalChunks: chunks.length,
      rawCandidateCount: allExtracted.length,
      dedupedCandidateCount: deduped.length,
      chunks: saved.map(toExtractedDocumentChunk),
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}
