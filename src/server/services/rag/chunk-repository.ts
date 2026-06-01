import { mockKnowledgeChunks } from "@/server/services/rag/mock-data";
import type {
  KnowledgeChunk,
  KnowledgeSourceType,
  RagRetrieveScope,
} from "@/features/rag/types";

type ChunkSource = "mock" | "database";

/**
 * RAG 知识片段读取模块。
 *
 * 职责：
 * 1. 屏蔽 mock 数据和真实数据库之间的数据来源差异。
 * 2. 把当前 Prisma schema 中的 KnowledgeChunk 转成 RAG 对接文档里的 KnowledgeChunk。
 * 3. 让 retriever 只依赖统一的领域类型，不关心底层数据来自哪里。
 */
export async function listKnowledgeChunks(
  scope: RagRetrieveScope
): Promise<KnowledgeChunk[]> {
  if (getChunkSource() === "database") {
    return listDatabaseKnowledgeChunks(scope);
  }

  return mockKnowledgeChunks;
}

/** 根据环境变量决定读取 mock 数据还是读取真实数据库。 */
function getChunkSource(): ChunkSource {
  return process.env.RAG_CHUNK_SOURCE === "database" ? "database" : "mock";
}

/** 从 Prisma 读取真实 chunk，并适配成 RAG 统一的 KnowledgeChunk 字段。 */
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

  return chunks.flatMap((chunk) => {
    if (!chunk.knowledgeBaseId) return [];

    return {
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
    };
  });
}

/** 将入库侧 sourceType 适配成 RAG 对接文档约定的来源类型。 */
function normalizeSourceType(sourceType: string): KnowledgeSourceType {
  if (sourceType === "manual") return "manual";
  if (sourceType === "file") return "file";
  if (sourceType === "wiki") return "wiki";
  return "import";
}
