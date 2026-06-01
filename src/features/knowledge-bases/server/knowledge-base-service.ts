import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

import { badRequest, conflict, notFound } from "./errors";
import { mapKnowledgeBaseListItem, mapKnowledgeBaseTree } from "./mappers";
import type {
  CreateKnowledgeBaseInput,
  CreateKnowledgeDocumentInput,
  UpdateKnowledgeBaseInput,
} from "./schemas";

export async function getKnowledgeBaseListService(params: {
  keyword?: string;
  status?: "active" | "disabled" | "all";
}) {
  const where: Prisma.KnowledgeBaseWhereInput = {
    ...(params.keyword
      ? {
          OR: [
            { name: { contains: params.keyword } },
            { description: { contains: params.keyword } },
          ],
        }
      : {}),
    ...(params.status && params.status !== "all"
      ? { status: params.status }
      : {}),
  };

  const items = await prisma.knowledgeBase.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      documents: {
        include: {
          document: {
            include: {
              chunks: {
                where: { status: "active" },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  return items.map(mapKnowledgeBaseListItem);
}

export async function getKnowledgeBaseTreeService(id: string) {
  const item = await prisma.knowledgeBase.findUnique({
    where: { id },
    include: {
      documents: {
        orderBy: { sortOrder: "asc" },
        include: {
          document: {
            include: {
              chunks: {
                orderBy: { chunkIndex: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!item) throw notFound("knowledge base not found");

  return mapKnowledgeBaseTree(item);
}

async function assertDocumentIdsExist(
  tx: Prisma.TransactionClient,
  documentIds: string[]
) {
  const uniqueDocumentIds = [...new Set(documentIds)];

  if (uniqueDocumentIds.length === 0) return uniqueDocumentIds;

  const existingDocuments = await tx.knowledgeDocument.findMany({
    where: { id: { in: uniqueDocumentIds } },
    select: { id: true },
  });

  if (existingDocuments.length !== uniqueDocumentIds.length) {
    const existingIds = new Set(existingDocuments.map((document) => document.id));
    const missingIds = uniqueDocumentIds.filter((id) => !existingIds.has(id));

    throw badRequest("some documents do not exist", { documentIds: missingIds });
  }

  return uniqueDocumentIds;
}

async function createDocumentWithChunks(
  tx: Prisma.TransactionClient,
  input: CreateKnowledgeDocumentInput
) {
  return tx.knowledgeDocument.create({
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
      chunks: input.chunks
        ? {
            create: input.chunks.map((chunk) => ({
              content: chunk.content,
              chunkIndex: chunk.chunkIndex,
              embedding: chunk.embedding,
              status: chunk.status,
              startIndex: chunk.startIndex,
              endIndex: chunk.endIndex,
            })),
          }
        : undefined,
    },
    select: { id: true },
  });
}

export async function createKnowledgeBaseService(
  input: CreateKnowledgeBaseInput
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existingDocumentIds = input.documentIds
        ? await assertDocumentIdsExist(tx, input.documentIds)
        : [];
      const createdDocuments = await Promise.all(
        (input.documents ?? []).map((document) =>
          createDocumentWithChunks(tx, document)
        )
      );
      const documentIds = [
        ...existingDocumentIds,
        ...createdDocuments.map((document) => document.id),
      ];

      const item = await tx.knowledgeBase.create({
        data: {
          name: input.name,
          description: input.description,
          icon: input.icon,
          similarityThreshold: input.similarityThreshold,
          topK: input.topK,
          status: input.status,
          documents:
            documentIds.length > 0
              ? {
                  create: documentIds.map((documentId, index) => ({
                    documentId,
                    sortOrder: index,
                  })),
                }
              : undefined,
        },
        include: {
          documents: {
            orderBy: { sortOrder: "asc" },
            include: {
              document: {
                include: {
                  chunks: {
                    orderBy: { chunkIndex: "asc" },
                  },
                },
              },
            },
          },
        },
      });

      if (documentIds.length > 0) {
        await tx.knowledgeDocument.updateMany({
          where: {
            id: { in: documentIds },
            knowledgeBaseId: null,
          },
          data: { knowledgeBaseId: item.id },
        });
        await tx.knowledgeChunk.updateMany({
          where: {
            documentId: { in: documentIds },
            knowledgeBaseId: null,
          },
          data: { knowledgeBaseId: item.id },
        });
      }

      return mapKnowledgeBaseTree(item);
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw conflict("knowledge base name already exists");
    }

    throw error;
  }
}

export async function updateKnowledgeBaseService(
  id: string,
  input: UpdateKnowledgeBaseInput
) {
  try {
    const item = await prisma.knowledgeBase.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        icon: input.icon,
        similarityThreshold: input.similarityThreshold,
        topK: input.topK,
        status: input.status,
      },
      include: {
        documents: {
          orderBy: { sortOrder: "asc" },
          include: {
            document: {
              include: {
                chunks: {
                  orderBy: { chunkIndex: "asc" },
                },
              },
            },
          },
        },
      },
    });

    return mapKnowledgeBaseTree(item);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw notFound("knowledge base not found");
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw conflict("knowledge base name already exists");
    }

    throw error;
  }
}

export async function deleteKnowledgeBaseService(id: string) {
  try {
    await prisma.knowledgeBase.delete({ where: { id } });
    return { id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw notFound("knowledge base not found");
    }

    throw error;
  }
}

export async function bindDocumentsToKnowledgeBaseService(
  knowledgeBaseId: string,
  documentIds: string[]
) {
  await prisma.$transaction(async (tx) => {
    const knowledgeBase = await tx.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true },
    });

    if (!knowledgeBase) throw notFound("knowledge base not found");

    const uniqueDocumentIds = await assertDocumentIdsExist(tx, documentIds);
    const existingRelations = await tx.knowledgeBaseDocument.findMany({
      where: {
        knowledgeBaseId,
        documentId: { in: uniqueDocumentIds },
      },
      select: { documentId: true },
    });
    const existingIds = new Set(
      existingRelations.map((relation) => relation.documentId)
    );
    const nextDocumentIds = uniqueDocumentIds.filter(
      (documentId) => !existingIds.has(documentId)
    );

    if (nextDocumentIds.length > 0) {
      const maxSort = await tx.knowledgeBaseDocument.findFirst({
        where: { knowledgeBaseId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const baseSortOrder = (maxSort?.sortOrder ?? -1) + 1;

      await tx.knowledgeBaseDocument.createMany({
        data: nextDocumentIds.map((documentId, index) => ({
          knowledgeBaseId,
          documentId,
          sortOrder: baseSortOrder + index,
        })),
      });
      await tx.knowledgeDocument.updateMany({
        where: {
          id: { in: nextDocumentIds },
          knowledgeBaseId: null,
        },
        data: { knowledgeBaseId },
      });
      await tx.knowledgeChunk.updateMany({
        where: {
          documentId: { in: nextDocumentIds },
          knowledgeBaseId: null,
        },
        data: { knowledgeBaseId },
      });
    }
  });

  return getKnowledgeBaseTreeService(knowledgeBaseId);
}

export async function unbindDocumentsFromKnowledgeBaseService(
  knowledgeBaseId: string,
  documentIds: string[]
) {
  await prisma.$transaction(async (tx) => {
    const knowledgeBase = await tx.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true },
    });

    if (!knowledgeBase) throw notFound("knowledge base not found");

    await tx.knowledgeBaseDocument.deleteMany({
      where: {
        knowledgeBaseId,
        documentId: { in: [...new Set(documentIds)] },
      },
    });
  });

  return getKnowledgeBaseTreeService(knowledgeBaseId);
}
