import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

import { badRequest, notFound } from "./errors";
import {
  mapKnowledgeChunk,
  mapKnowledgeDocumentDetail,
  mapKnowledgeDocumentListItem,
} from "./mappers";
import type {
  CreateKnowledgeChunkInput,
  CreateKnowledgeDocumentInput,
  UpdateKnowledgeDocumentInput,
} from "./schemas";

export async function getDocumentListService(params: {
  keyword?: string;
  sourceType?:
    | "manual"
    | "file"
    | "url"
    | "text"
    | "markdown"
    | "image"
    | "ai"
    | "all";
  status?: "active" | "disabled" | "all";
  parseStatus?: "pending" | "processing" | "success" | "failed" | "all";
}) {
  const where: Prisma.DocumentSourceWhereInput = {
    ...(params.keyword
      ? {
          OR: [
            { title: { contains: params.keyword } },
            { originalName: { contains: params.keyword } },
            { fileName: { contains: params.keyword } },
            { rawContent: { contains: params.keyword } },
            { content: { contains: params.keyword } },
          ],
        }
      : {}),
    ...(params.sourceType && params.sourceType !== "all"
      ? { sourceType: params.sourceType }
      : {}),
    ...(params.status && params.status !== "all"
      ? { status: params.status }
      : {}),
    ...(params.parseStatus && params.parseStatus !== "all"
      ? { parseStatus: params.parseStatus }
      : {}),
  };

  const documents = await prisma.documentSource.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      chunks: {
        where: { status: "active" },
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

  return documents.map(mapKnowledgeDocumentListItem);
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
      existingKnowledgeBases.map((knowledgeBase) => knowledgeBase.id)
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

export async function createDocumentService(input: CreateKnowledgeDocumentInput) {
  return prisma.$transaction(async (tx) => {
    const knowledgeBaseIds = input.knowledgeBaseIds
      ? await assertKnowledgeBaseIdsExist(tx, input.knowledgeBaseIds)
      : [];
    const chunks = input.chunks ?? [];

    const document = await tx.documentSource.create({
      data: {
        title: input.title,
        sourceType: input.sourceType,
        originalName: input.originalName ?? input.fileName,
        fileType: input.fileType,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        content: input.content ?? input.rawContent,
        rawContent: input.rawContent ?? input.content,
        parseStatus: input.parseStatus,
        status: input.status,
        errorMessage: input.errorMessage,
        chunkCount: chunks.length,
        chunks:
          chunks.length > 0
            ? {
                create: chunks.map((chunk) => ({
                  content: chunk.content,
                  chunkIndex: chunk.chunkIndex,
                  embedding: chunk.embedding,
                  category: chunk.category,
                  type: chunk.type,
                  status: chunk.status,
                  charStart: chunk.charStart,
                  charEnd: chunk.charEnd,
                })),
              }
            : undefined,
        knowledgeBases:
          knowledgeBaseIds.length > 0
            ? {
                create: knowledgeBaseIds.map((knowledgeBaseId, index) => ({
                  knowledgeBaseId,
                  sortOrder: index,
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

    return mapKnowledgeDocumentDetail(document);
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

  return mapKnowledgeDocumentDetail(document);
}

export async function updateDocumentService(
  id: string,
  input: UpdateKnowledgeDocumentInput
) {
  try {
    const document = await prisma.documentSource.update({
      where: { id },
      data: {
        title: input.title,
        sourceType: input.sourceType,
        originalName: input.originalName,
        fileType: input.fileType,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        content: input.content,
        rawContent: input.rawContent,
        parseStatus: input.parseStatus,
        status: input.status,
        errorMessage: input.errorMessage,
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

    return mapKnowledgeDocumentDetail(document);
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

export async function deleteDocumentService(id: string) {
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

  return chunks.map(mapKnowledgeChunk);
}

export async function replaceDocumentChunksService(
  documentId: string,
  chunks: CreateKnowledgeChunkInput[]
) {
  return prisma.$transaction(async (tx) => {
    const document = await tx.documentSource.findUnique({
      where: { id: documentId },
      select: { id: true },
    });

    if (!document) throw notFound("document not found");

    await tx.documentChunk.deleteMany({
      where: { documentSourceId: documentId },
    });

    if (chunks.length > 0) {
      await tx.documentChunk.createMany({
        data: chunks.map((chunk) => ({
          documentSourceId: documentId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          embedding: chunk.embedding ?? null,
          category: chunk.category,
          type: chunk.type,
          status: chunk.status,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
        })),
      });
    }

    await tx.documentSource.update({
      where: { id: documentId },
      data: { chunkCount: chunks.length },
    });

    const nextChunks = await tx.documentChunk.findMany({
      where: { documentSourceId: documentId },
      orderBy: { chunkIndex: "asc" },
    });

    return nextChunks.map(mapKnowledgeChunk);
  });
}
