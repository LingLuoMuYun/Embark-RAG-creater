import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

import {
  getFileTypeFromName,
  parseFileContent,
  validateFileType,
  MAX_FILE_SIZE,
} from "@/lib/file-parser";
import { splitTextIntoChunks } from "@/lib/text-splitter";
import type { TextChunk } from "@/lib/text-splitter";
import { embedTexts } from "@/lib/embedding";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch {
    // directory already exists
  }
}

export type DocumentCreateInput = {
  originalName: string;
  fileType: string;
  fileSize: number;
};

export type DocumentListOptions = {
  page?: number;
  pageSize?: number;
  status?: string;
  hasCandidates?: boolean;
};

export async function createDocument(input: DocumentCreateInput) {
  const doc = await prisma.documentSource.create({
    data: {
      originalName: input.originalName,
      fileType: input.fileType,
      fileSize: input.fileSize,
      status: "uploading",
    },
  });
  return doc;
}

export async function updateDocumentStatus(
  id: string,
  status: string,
  extra?: { content?: string; errorMessage?: string }
) {
  const data: Prisma.DocumentSourceUpdateInput = { status };
  if (extra?.content !== undefined) data.content = extra.content;
  if (extra?.errorMessage !== undefined) data.errorMessage = extra.errorMessage;
  return prisma.documentSource.update({ where: { id }, data });
}

export async function getDocumentById(id: string) {
  return prisma.documentSource.findUnique({ where: { id } });
}

export async function listDocuments(options: DocumentListOptions = {}) {
  const { page = 1, pageSize = 20, status, hasCandidates } = options;

  const where: Prisma.DocumentSourceWhereInput = {};
  if (status) where.status = status;

  if (hasCandidates) {
    const docIds = await prisma.candidateKnowledge.findMany({
      select: { documentSourceId: true },
      distinct: ["documentSourceId"],
      where: { documentSourceId: { not: null } },
    });
    where.id = { in: docIds.map((d) => d.documentSourceId!).filter(Boolean) };
  }

  const [items, total] = await Promise.all([
    prisma.documentSource.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.documentSource.count({ where }),
  ]);

  // 获取每个文档关联的候选知识数量
  const docIds = items.map((d) => d.id);
  const candidateCounts = docIds.length > 0
    ? await prisma.candidateKnowledge.groupBy({
        by: ["documentSourceId", "status"],
        where: { documentSourceId: { in: docIds } },
        _count: { id: true },
      })
    : [];

  const candidateMap: Record<string, { pending: number; confirmed: number }> = {};
  for (const c of candidateCounts) {
    if (!c.documentSourceId) continue;
    if (!candidateMap[c.documentSourceId]) {
      candidateMap[c.documentSourceId] = { pending: 0, confirmed: 0 };
    }
    if (c.status === "confirmed") {
      candidateMap[c.documentSourceId].confirmed = c._count.id;
    } else {
      candidateMap[c.documentSourceId].pending = c._count.id;
    }
  }

  const itemsWithCandidates = items.map((d) => ({
    ...d,
    candidatePending: candidateMap[d.id]?.pending ?? 0,
    candidateConfirmed: candidateMap[d.id]?.confirmed ?? 0,
  }));

  return { items: itemsWithCandidates, total, page, pageSize };
}

export async function deleteDocument(id: string) {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) return null;

  // Try to delete the physical file if it exists
  const filePath = path.join(UPLOAD_DIR, doc.id);
  try {
    await fs.unlink(filePath);
  } catch {
    // file may not exist on disk
  }

  await prisma.$transaction([
    prisma.candidateKnowledge.deleteMany({ where: { documentSourceId: id } }),
    prisma.documentSource.delete({ where: { id } }),
  ]);
  return doc;
}

export async function saveDocumentFile(
  id: string,
  buffer: Buffer
): Promise<void> {
  await ensureUploadDir();
  const filePath = path.join(UPLOAD_DIR, id);
  await fs.writeFile(filePath, buffer);
}

export async function parseDocument(id: string): Promise<{
  content: string;
  chunkCount: number;
}> {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) throw new Error(`Document not found: ${id}`);
  if (!validateFileType(doc.fileType)) {
    throw new Error(`Unsupported file type: ${doc.fileType}`);
  }

  // Update status to parsing
  await updateDocumentStatus(id, "parsing");

  try {
    // Read the saved file
    const filePath = path.join(UPLOAD_DIR, id);
    const buffer = await fs.readFile(filePath);

    const content = await parseFileContent(buffer, doc.fileType);

    // Split content into chunks
    const chunks = splitTextIntoChunks(content);

    // Delete old chunks and create new ones in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentSourceId: id } });

      if (chunks.length > 0) {
        await tx.documentChunk.createMany({
          data: chunks.map((chunk: TextChunk, index: number) => ({
            documentSourceId: id,
            chunkIndex: index,
            content: chunk.content,
            charStart: chunk.charStart,
            charEnd: chunk.charEnd,
          })),
        });
      }

      await tx.documentSource.update({
        where: { id },
        data: {
          status: "parsed",
          content,
          chunkCount: chunks.length,
        },
      });
    });

    // 自动向量化所有分块（失败不影响解析结果）
    if (chunks.length > 0) {
      try {
        const chunkRecords = await prisma.documentChunk.findMany({
          where: { documentSourceId: id },
          orderBy: { chunkIndex: "asc" },
        });

        const texts = chunkRecords.map((c) => c.content);
        const totalChunks = texts.length;

        // 标记向量化开始
        await prisma.documentSource.update({
          where: { id },
          data: { embedStatus: "embedding", embeddedCount: 0 },
        });

        // 逐批向量化并更新进度
        const BATCH = 20;
        for (let start = 0; start < texts.length; start += BATCH) {
          const batchTexts = texts.slice(start, start + BATCH);
          const batchVectors = await embedTexts(batchTexts);

          for (let j = 0; j < batchTexts.length; j++) {
            const chunkIdx = start + j;
            const vector = batchVectors[j];
            if (vector) {
              await prisma.documentChunk.update({
                where: { id: chunkRecords[chunkIdx].id },
                data: { embedding: JSON.stringify(vector) },
              });
            }
          }

          // 更新已向量化计数
          const done = Math.min(start + BATCH, totalChunks);
          await prisma.documentSource.update({
            where: { id },
            data: { embeddedCount: done },
          });
        }

        // 向量化全部完成
        await prisma.documentSource.update({
          where: { id },
          data: { embedStatus: "embedded", embeddedCount: totalChunks },
        });
      } catch (embedError) {
        console.error(
          `[embedding] Failed to embed chunks for document ${id}:`,
          embedError instanceof Error ? embedError.message : embedError,
        );
        await prisma.documentSource.update({
          where: { id },
          data: { embedStatus: "failed" },
        });
      }
    } else {
      // 无分块内容，直接标记为已向量化
      await prisma.documentSource.update({
        where: { id },
        data: { embedStatus: "embedded", embeddedCount: 0 },
      });
    }

    return { content, chunkCount: chunks.length };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parse error";
    await updateDocumentStatus(id, "failed", { errorMessage: message });
    throw error;
  }
}

export async function updateDocumentContent(id: string, content: string) {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) return null;

  // Re-split the updated content into chunks
  const chunks = splitTextIntoChunks(content);

  await prisma.$transaction(async (tx) => {
    await tx.documentChunk.deleteMany({ where: { documentSourceId: id } });

    if (chunks.length > 0) {
      await tx.documentChunk.createMany({
        data: chunks.map((chunk: TextChunk, index: number) => ({
          documentSourceId: id,
          chunkIndex: index,
          content: chunk.content,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
        })),
      });
    }

    await tx.documentSource.update({
      where: { id },
      data: { content, chunkCount: chunks.length },
    });
  });

  return prisma.documentSource.findUnique({ where: { id } });
}

export async function getDocumentChunks(documentSourceId: string) {
  return prisma.documentChunk.findMany({
    where: { documentSourceId },
    orderBy: { chunkIndex: "asc" },
  });
}

export async function getDocumentWithChunks(id: string) {
  return prisma.documentSource.findUnique({
    where: { id },
    include: {
      chunks: {
        orderBy: { chunkIndex: "asc" },
      },
    },
  });
}

export { MAX_FILE_SIZE, getFileTypeFromName };

/**
 * Find documents stuck in "parsing" status (e.g. due to a crashed server or
 * hung OCR worker) and mark them as failed so the user can retry.
 *
 * Returns the number of documents that were recovered.
 */
export async function recoverStuckDocuments(): Promise<number> {
  // 恢复卡在"解析中"的文档
  const parsingResult = await prisma.documentSource.updateMany({
    where: { status: "parsing" },
    data: {
      status: "failed",
      errorMessage: "解析进程异常中断，已自动恢复",
    },
  });

  // 恢复卡在"向量化中"的文档
  const embeddingResult = await prisma.documentSource.updateMany({
    where: { embedStatus: "embedding" },
    data: {
      embedStatus: "failed",
    },
  });

  return parsingResult.count + embeddingResult.count;
}
