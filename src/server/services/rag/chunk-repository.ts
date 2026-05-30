import { mockKnowledgeChunks } from "@/server/services/rag/mock-data";
import type {
  KnowledgeChunk,
  KnowledgeSourceType,
  RagRetrieveScope,
} from "@/features/rag/types";

type ChunkSource = "mock" | "database";

/**
 * RAG 的知识片段读取层。
 *
 * 默认使用 mock 数据保证本地闭环稳定；需要接真实入库数据时，
 * 设置 RAG_CHUNK_SOURCE=database，只替换这里的数据来源即可。
 */
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

  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      knowledgeBaseId: {
        in: scope.knowledgeBaseIds,
      },
      documentId: scope.knowledgeIds
        ? {
            in: scope.knowledgeIds,
          }
        : undefined,
      status: "active",
    },
    include: {
      document: true,
    },
    orderBy: [
      {
        knowledgeBaseId: "asc",
      },
      {
        documentId: "asc",
      },
      {
        chunkIndex: "asc",
      },
    ],
  });

  return chunks.map((chunk) => ({
    id: chunk.id,
    knowledgeBaseId: chunk.knowledgeBaseId,
    knowledgeId: chunk.documentId,
    title: chunk.document.title,
    content: chunk.content,
    status: chunk.status === "active" ? "available" : "disabled",
    sourceType: normalizeSourceType(chunk.document.sourceType),
    chunkType: "text",
    chunkIndex: chunk.chunkIndex,
    metadata: {
      fileName: chunk.document.fileName,
      fileUrl: chunk.document.fileUrl,
      mimeType: chunk.document.mimeType,
      fileSize: chunk.document.fileSize,
      startIndex: chunk.startIndex,
      endIndex: chunk.endIndex,
      parseStatus: chunk.document.parseStatus,
    },
    createdAt: chunk.createdAt.toISOString(),
    updatedAt: chunk.updatedAt.toISOString(),
  }));
}

function normalizeSourceType(sourceType: string): KnowledgeSourceType {
  if (sourceType === "manual") return "manual";
  if (sourceType === "file") return "file";
  if (sourceType === "wiki") return "wiki";
  return "import";
}
