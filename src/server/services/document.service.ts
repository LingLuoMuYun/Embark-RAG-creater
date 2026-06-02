import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

import {
  getFileTypeFromName,
  parseFileContent,
  validateFileType,
  MAX_FILE_SIZE,
} from "@/lib/file-parser";
import { splitTextIntoChunks } from "@/lib/text-splitter";
import { splitTextSemantic } from "@/lib/semantic-splitter";
import type { TextChunk } from "@/lib/text-splitter";
import { badRequest, notFound } from "@/features/knowledge-bases/server/errors";
import {
  mapDocumentChunk,
  mapDocumentSourceDetail,
  mapDocumentSourceListItem,
} from "@/features/knowledge-bases/server/mappers";
import type {
  CreateDocumentChunkInput,
  CreateDocumentSourceInput,
  UpdateDocumentSourceInput,
} from "@/features/knowledge-bases/server/schemas";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// ========== Helpers ==========

function containsTable(text: string): boolean {
  return /^\|.+\|$/m.test(text);
}

async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch {
    // directory already exists
  }
}

// ========== Types ==========

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

// ========== Low-level CRUD (used by document import pipeline) ==========

export async function createDocument(input: DocumentCreateInput) {
  const doc = await prisma.documentSource.create({
    data: {
      originalName: input.originalName,
      title: input.originalName,
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
  extra?: { rawContent?: string; error?: string }
) {
  const data: Prisma.DocumentSourceUpdateInput = { status };
  if (extra?.rawContent !== undefined) data.rawContent = extra.rawContent;
  if (extra?.error !== undefined) data.error = extra.error;
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
    const docIds = await prisma.documentChunk.findMany({
      select: { documentSourceId: true },
      distinct: ["documentSourceId"],
      where: { chunkType: "knowledge", reviewStatus: { not: null } },
    });
    where.id = { in: docIds.map((d) => d.documentSourceId).filter((id): id is string => id !== null) };
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

  const docIds = items.map((d) => d.id);
  const candidateCounts =
    docIds.length > 0
      ? await prisma.documentChunk.groupBy({
          by: ["documentSourceId", "reviewStatus"],
          where: {
            documentSourceId: { in: docIds },
            chunkType: "knowledge",
            reviewStatus: { not: null },
          },
          _count: { id: true },
        })
      : [];

  const candidateMap: Record<
    string,
    { pending: number; confirmed: number }
  > = {};
  for (const c of candidateCounts) {
    if (!c.documentSourceId) continue;
    if (!candidateMap[c.documentSourceId]) {
      candidateMap[c.documentSourceId] = { pending: 0, confirmed: 0 };
    }
    if (c.reviewStatus === "confirmed") {
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

  const filePath = path.join(UPLOAD_DIR, doc.id);
  try {
    await fs.unlink(filePath);
  } catch {
    // file may not exist on disk
  }

  await prisma.documentSource.delete({ where: { id } });
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
  rawContent: string;
  chunkCount: number;
}> {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) throw new Error(`Document not found: ${id}`);
  if (!validateFileType(doc.fileType)) {
    throw new Error(`Unsupported file type: ${doc.fileType}`);
  }

  await updateDocumentStatus(id, "parsing");

  try {
    const filePath = path.join(UPLOAD_DIR, id);
    const buffer = await fs.readFile(filePath);

    const rawContent = await parseFileContent(buffer, doc.fileType);

    if (doc.rawContent === rawContent && doc.status === "parsed") {
      await updateDocumentStatus(id, "parsed");
      return { rawContent, chunkCount: doc.chunkCount };
    }

    const hasTable = containsTable(rawContent);
    const semanticChunks = hasTable
      ? null
      : await splitTextSemantic(rawContent);
    const chunks =
      semanticChunks ?? splitTextIntoChunks(rawContent);

    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({
        where: { documentSourceId: id },
      });

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
          rawContent,
          chunkCount: chunks.length,
        },
      });
    });

    return { rawContent, chunkCount: chunks.length };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown parse error";
    await updateDocumentStatus(id, "failed", { error: message });
    throw error;
  }
}

export async function updateDocumentContent(id: string, rawContent: string) {
  const doc = await prisma.documentSource.findUnique({ where: { id } });
  if (!doc) return null;

  if (doc.rawContent === rawContent) return doc;

  const hasTable = containsTable(rawContent);
  const semanticChunks = hasTable
    ? null
    : await splitTextSemantic(rawContent);
  const chunks = semanticChunks ?? splitTextIntoChunks(rawContent);

  await prisma.$transaction(async (tx) => {
    await tx.documentChunk.deleteMany({
      where: { documentSourceId: id },
    });

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
      data: { rawContent, chunkCount: chunks.length },
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

// ========== Knowledge Document Service (merged from knowledge-document-service.ts) ==========

export async function getDocumentListService(params: {
  keyword?: string;
  sourceType?:
    | "manual"
    | "file"
    | "url"
    | "text"
    | "markdown"
    | "image"
    | "all";
  activeStatus?: "active" | "disabled" | "all";
  status?: "uploading" | "uploaded" | "pending" | "parsing" | "parsed" | "failed" | "all";
}) {
  const where: Prisma.DocumentSourceWhereInput = {
    ...(params.keyword
      ? {
          OR: [
            { title: { contains: params.keyword } },
            { fileName: { contains: params.keyword } },
            { rawContent: { contains: params.keyword } },
          ],
        }
      : {}),
    ...(params.sourceType && params.sourceType !== "all"
      ? { sourceType: params.sourceType }
      : {}),
    ...(params.activeStatus && params.activeStatus !== "all"
      ? { activeStatus: params.activeStatus }
      : {}),
    ...(params.status && params.status !== "all"
      ? { status: params.status }
      : {}),
  };

  const documents = await prisma.documentSource.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      chunks: {
        where: { chunkStatus: "active" },
        orderBy: { chunkIndex: "asc" },
      },
      knowledgeBases: {
        include: {
          knowledgeBase: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      },
    },
  });

  return documents.map(mapDocumentSourceListItem);
}

async function assertKnowledgeBaseIdsExist(
  tx: Prisma.TransactionClient,
  knowledgeBaseIds: string[]
) {
  const uniqueKnowledgeBaseIds = [...new Set(knowledgeBaseIds)];

  if (uniqueKnowledgeBaseIds.length === 0) return uniqueKnowledgeBaseIds;

  const existingKnowledgeBases = await tx.knowledgeBase.findMany({
    where: { id: { in: uniqueKnowledgeBaseIds } },
    select: { id: true },
  });

  if (existingKnowledgeBases.length !== uniqueKnowledgeBaseIds.length) {
    const existingIds = new Set(
      existingKnowledgeBases.map((kb) => kb.id)
    );
    const missingIds = uniqueKnowledgeBaseIds.filter(
      (id) => !existingIds.has(id)
    );

    throw badRequest("some knowledge bases do not exist", {
      knowledgeBaseIds: missingIds,
    });
  }

  return uniqueKnowledgeBaseIds;
}

export async function createDocumentSourceService(
  input: CreateDocumentSourceInput
) {
  return prisma.$transaction(async (tx) => {
    const knowledgeBaseIds = input.knowledgeBaseIds
      ? await assertKnowledgeBaseIdsExist(tx, input.knowledgeBaseIds)
      : [];

    const document = await tx.documentSource.create({
      data: {
        knowledgeBaseId: knowledgeBaseIds[0],
        title: input.title,
        originalName: input.fileName ?? input.title,
        fileType: input.fileName
          ? (input.fileName.split(".").pop() ?? "txt")
          : "txt",
        sourceType: input.sourceType,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        mimeType: input.mimeType,
        fileSize: input.fileSize ?? 0,
        rawContent: input.rawContent,
        chunkSize: input.chunkSize,
        chunkOverlap: input.chunkOverlap,
        status: input.rawContent ? "parsed" : "pending",
        activeStatus: input.activeStatus ?? "active",
        error: input.error,
        chunks: input.chunks
          ? {
              create: input.chunks.map((chunk) => ({
                content: chunk.content,
                chunkIndex: chunk.chunkIndex,
                embedding: chunk.embedding,
                chunkStatus: chunk.chunkStatus ?? "active",
                charStart: chunk.startIndex ?? 0,
                charEnd: chunk.endIndex ?? chunk.content.length,
              })),
            }
          : undefined,
        knowledgeBases:
          knowledgeBaseIds.length > 0
            ? {
                create: knowledgeBaseIds.map((kbId) => ({
                  knowledgeBaseId: kbId,
                })),
              }
            : undefined,
      },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
        },
        knowledgeBases: {
          include: {
            knowledgeBase: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
      },
    });

    return mapDocumentSourceDetail(document);
  });
}

export async function getDocumentDetailService(id: string) {
  const document = await prisma.documentSource.findUnique({
    where: { id },
    include: {
      chunks: {
        orderBy: { chunkIndex: "asc" },
      },
      knowledgeBases: {
        include: {
          knowledgeBase: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!document) throw notFound("document not found");

  return mapDocumentSourceDetail(document);
}

export async function updateDocumentSourceService(
  id: string,
  input: UpdateDocumentSourceInput
) {
  try {
    const document = await prisma.documentSource.update({
      where: { id },
      data: {
        title: input.title,
        sourceType: input.sourceType,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        rawContent: input.rawContent,
        chunkSize: input.chunkSize,
        chunkOverlap: input.chunkOverlap,
        status: input.status,
        activeStatus: input.activeStatus,
        error: input.error,
      },
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
        },
        knowledgeBases: {
          include: {
            knowledgeBase: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
      },
    });

    return mapDocumentSourceDetail(document);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw notFound("document not found");
    }

    throw error;
  }
}

export async function deleteDocumentSourceService(id: string) {
  try {
    await prisma.documentSource.delete({ where: { id } });
    return { id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw notFound("document not found");
    }

    throw error;
  }
}

export async function getDocumentChunksService(id: string) {
  const document = await prisma.documentSource.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!document) throw notFound("document not found");

  const chunks = await prisma.documentChunk.findMany({
    where: { documentSourceId: id },
    orderBy: { chunkIndex: "asc" },
  });

  return chunks.map(mapDocumentChunk);
}

export async function replaceDocumentChunksService(
  documentSourceId: string,
  chunks: CreateDocumentChunkInput[]
) {
  return prisma.$transaction(async (tx) => {
    const document = await tx.documentSource.findUnique({
      where: { id: documentSourceId },
      select: {
        id: true,
        knowledgeBases: {
          orderBy: { sortOrder: "asc" },
          select: { knowledgeBaseId: true },
        },
      },
    });

    if (!document) throw notFound("document not found");

    await tx.documentChunk.deleteMany({
      where: { documentSourceId },
    });

    if (chunks.length > 0) {
      await tx.documentChunk.createMany({
        data: chunks.map((chunk) => ({
          documentSourceId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          embedding: chunk.embedding,
          chunkStatus: chunk.chunkStatus ?? "active",
          charStart: chunk.startIndex ?? 0,
          charEnd: chunk.endIndex ?? chunk.content.length,
        })),
      });
    }

    const nextChunks = await tx.documentChunk.findMany({
      where: { documentSourceId },
      orderBy: { chunkIndex: "asc" },
    });

    return nextChunks.map(mapDocumentChunk);
  });
}
