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
 * 2. 把当前 Prisma schema 中的 DocumentChunk 转成 RAG 对接文档里的 KnowledgeChunk。
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

  const chunks = await prisma.documentChunk.findMany({
    where: {
      chunkStatus: "active",
      documentSource: {
        knowledgeBases: {
          some: { knowledgeBaseId: { in: scope.knowledgeBaseIds } },
        },
      },
      documentSourceId: scope.knowledgeIds
        ? {
            in: scope.knowledgeIds,
          }
        : undefined,
    },
    include: {
      documentSource: {
        include: {
          knowledgeBases: true,
        },
      },
    },
    orderBy: [
      {
        documentSourceId: "asc",
      },
      {
        chunkIndex: "asc",
      },
    ],
  });

  return chunks.flatMap((chunk) => {
    const kbid = chunk.documentSource?.knowledgeBases?.[0]?.knowledgeBaseId;
    if (!kbid) return [];

    return {
      id: chunk.id,
      knowledgeBaseId: kbid,
      knowledgeId: chunk.documentSourceId ?? chunk.id,
      title: chunk.documentSource?.title ?? chunk.title ?? "",
      content: chunk.content,
      status: chunk.chunkStatus === "active" ? "available" : "disabled",
      sourceType: normalizeSourceType(chunk.documentSource?.sourceType ?? "import"),
      chunkType: chunk.chunkType === "knowledge" ? "summary" : "text",
      chunkIndex: chunk.chunkIndex,
      metadata: {
        fileName: chunk.documentSource?.fileName,
        fileUrl: chunk.documentSource?.fileUrl,
        mimeType: chunk.documentSource?.mimeType,
        fileSize: chunk.documentSource?.fileSize,
        startIndex: chunk.charStart,
        endIndex: chunk.charEnd,
        parseStatus: chunk.documentSource?.status,
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
