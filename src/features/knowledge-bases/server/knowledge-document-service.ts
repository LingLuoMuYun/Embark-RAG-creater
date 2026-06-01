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
  sourceType?: "manual" | "file" | "url" | "text" | "markdown" | "image" | "all";
  status?: "active" | "disabled" | "all";
  parseStatus?: "pending" | "processing" | "success" | "failed" | "all";
}) {
  const where: Prisma.KnowledgeDocumentWhereInput = {
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
    ...(params.status && params.status !== "all"
      ? { status: params.status }
      : {}),
    ...(params.parseStatus && params.parseStatus !== "all"
      ? { parseStatus: params.parseStatus }
      : {}),
  };

  const documents = await prisma.knowledgeDocument.findMany({
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

    const document = await tx.knowledgeDocument.create({
      data: {
        knowledgeBaseId: knowledgeBaseIds[0],
        title: input.title,
        sourceType: input.sourceType,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        rawContent: input.rawContent,
        chunkSize: input.chunkSize,
        chunkOverlap: input.chunkOverlap,
        parseStatus: input.parseStatus,
        status: input.status,
        error: input.error,
        chunks: input.chunks
          ? {
              create: input.chunks.map((chunk) => ({
                content: chunk.content,
                chunkIndex: chunk.chunkIndex,
                knowledgeBaseId: knowledgeBaseIds[0],
                embedding: chunk.embedding,
                status: chunk.status,
                startIndex: chunk.startIndex,
                endIndex: chunk.endIndex,
              })),
            }
          : undefined,
        knowledgeBases:
          knowledgeBaseIds.length > 0
            ? {
                create: knowledgeBaseIds.map((knowledgeBaseId) => ({
                  knowledgeBaseId,
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
  const document = await prisma.knowledgeDocument.findUnique({
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
    const document = await prisma.knowledgeDocument.update({
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
        parseStatus: input.parseStatus,
        status: input.status,
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
    await prisma.knowledgeDocument.delete({ where: { id } });
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
  const document = await prisma.knowledgeDocument.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!document) throw notFound("document not found");

  const chunks = await prisma.knowledgeChunk.findMany({
    where: { documentId: id },
    orderBy: { chunkIndex: "asc" },
  });

  return chunks.map(mapKnowledgeChunk);
}

export async function replaceDocumentChunksService(
  documentId: string,
  chunks: CreateKnowledgeChunkInput[]
) {
  return prisma.$transaction(async (tx) => {
    const document = await tx.knowledgeDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        knowledgeBaseId: true,
        knowledgeBases: {
          orderBy: { sortOrder: "asc" },
          select: { knowledgeBaseId: true },
        },
      },
    });

    if (!document) throw notFound("document not found");

    await tx.knowledgeChunk.deleteMany({
      where: { documentId },
    });

    if (chunks.length > 0) {
      const knowledgeBaseId =
        document.knowledgeBaseId ??
        document.knowledgeBases[0]?.knowledgeBaseId;

      await tx.knowledgeChunk.createMany({
        data: chunks.map((chunk) => ({
          documentId,
          knowledgeBaseId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          embedding: chunk.embedding,
          status: chunk.status,
          startIndex: chunk.startIndex,
          endIndex: chunk.endIndex,
        })),
      });
    }

    const nextChunks = await tx.knowledgeChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: "asc" },
    });

    return nextChunks.map(mapKnowledgeChunk);
  });
}
