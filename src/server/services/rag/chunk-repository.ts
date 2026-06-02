import { mockKnowledgeChunks } from "@/server/services/rag/mock-data";
import type {
  KnowledgeChunk,
  KnowledgeChunkType,
  KnowledgeSourceType,
  RagRetrieveScope,
} from "@/features/rag/types";

type ChunkSource = "mock" | "database";

export async function listKnowledgeChunks(
  scope: RagRetrieveScope
): Promise<KnowledgeChunk[]> {
  if (getChunkSource() === "database") {
    return listDatabaseKnowledgeChunks(scope);
  }

  return mockKnowledgeChunks;
}

function getChunkSource(): ChunkSource {
  return process.env.RAG_CHUNK_SOURCE === "database" ? "database" : "mock";
}

async function listDatabaseKnowledgeChunks(
  scope: RagRetrieveScope
): Promise<KnowledgeChunk[]> {
  const { prisma } = await import("@/lib/db");

  const relations = await prisma.knowledgeBaseDocument.findMany({
    where: {
      knowledgeBaseId: { in: scope.knowledgeBaseIds },
      status: "active",
      documentId: scope.knowledgeIds ? { in: scope.knowledgeIds } : undefined,
    },
    include: {
      document: {
        include: {
          chunks: {
            where: {
              status: "active",
              category: scope.categories ? { in: scope.categories } : undefined,
              type: scope.types ? { in: scope.types } : undefined,
            },
            orderBy: { chunkIndex: "asc" },
          },
        },
      },
    },
    orderBy: [{ knowledgeBaseId: "asc" }, { documentId: "asc" }],
  });

  return relations.flatMap((relation) =>
    relation.document.chunks.map((chunk) => ({
      id: chunk.id,
      knowledgeBaseId: relation.knowledgeBaseId,
      knowledgeId: relation.documentId,
      title: relation.document.title,
      content: chunk.content,
      summary: undefined,
      category: chunk.category ?? undefined,
      tagIds: undefined,
      status: chunk.status === "active" ? "available" : "disabled",
      sourceType: normalizeSourceType(relation.document.sourceType),
      chunkType: normalizeChunkType(chunk.type),
      chunkIndex: chunk.chunkIndex,
      metadata: {
        sourceType: relation.document.sourceType,
        originalName: relation.document.originalName,
        fileName: relation.document.fileName,
        fileUrl: relation.document.fileUrl,
        mimeType: relation.document.mimeType,
        fileSize: relation.document.fileSize,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        parseStatus: relation.document.parseStatus,
        embedding: chunk.embedding,
      },
      createdAt: chunk.createdAt.toISOString(),
      updatedAt: chunk.updatedAt.toISOString(),
    }))
  );
}

function normalizeSourceType(sourceType: string): KnowledgeSourceType {
  if (
    sourceType === "manual" ||
    sourceType === "file" ||
    sourceType === "url" ||
    sourceType === "text" ||
    sourceType === "markdown" ||
    sourceType === "image" ||
    sourceType === "ai"
  ) {
    return sourceType;
  }
  return "import";
}

function normalizeChunkType(type: string): KnowledgeChunkType {
  if (
    type === "faq" ||
    type === "concept" ||
    type === "procedure" ||
    type === "note" ||
    type === "summary"
  ) {
    return type;
  }

  if (type === "qa") return "faq";
  if (type === "wiki") return "concept";
  if (type === "text") return "note";
  return "note";
}
