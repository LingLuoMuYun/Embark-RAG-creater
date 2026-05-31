import {
  embedChunk,
  getChunkEmbeddingText,
  MOCK_EMBEDDING_MODEL,
  type EmbeddingVector,
} from "@/server/services/rag/embedding";
import { prisma } from "@/lib/db";
import type { KnowledgeChunk } from "@/features/rag/types";

export type ChunkEmbedding = {
  chunkId: string;
  embedding: EmbeddingVector;
  embeddingModel: string;
  contentHash: string;
  updatedAt: string;
};

/** 计算 chunk 当前 embedding 输入内容的稳定 hash，用于判断索引是否过期。 */
export function computeChunkContentHash(chunk: KnowledgeChunk): string {
  return hashString(getChunkEmbeddingText(chunk));
}

/** 为单个 chunk 生成 embedding 并写入本地 SQLite/Prisma 索引。 */
export async function indexChunk(chunk: KnowledgeChunk): Promise<ChunkEmbedding> {
  const chunkEmbeddingInput = {
    chunkId: chunk.id,
    embedding: serializeEmbedding(embedChunk(chunk)),
    embeddingModel: MOCK_EMBEDDING_MODEL,
    contentHash: computeChunkContentHash(chunk),
  };

  const savedEmbedding = await prisma.chunkEmbedding.upsert({
    where: {
      chunkId: chunk.id,
    },
    create: chunkEmbeddingInput,
    update: chunkEmbeddingInput,
  });

  return toChunkEmbedding(savedEmbedding);
}

/** 批量为 chunks 生成 embedding 并写入本地 SQLite/Prisma 索引。 */
export async function indexChunks(
  chunks: KnowledgeChunk[]
): Promise<ChunkEmbedding[]> {
  return Promise.all(chunks.map(indexChunk));
}

/** 删除指定 chunk 的本地 embedding 索引。 */
export async function deleteChunkEmbedding(chunkId: string): Promise<boolean> {
  const result = await prisma.chunkEmbedding.deleteMany({
    where: {
      chunkId,
    },
  });

  return result.count > 0;
}

/** 读取指定 chunkId 的本地 embedding 索引。 */
export async function getChunkEmbedding(
  chunkId: string
): Promise<ChunkEmbedding | undefined> {
  const chunkEmbedding = await prisma.chunkEmbedding.findUnique({
    where: {
      chunkId,
    },
  });

  return chunkEmbedding ? toChunkEmbedding(chunkEmbedding) : undefined;
}

/** 批量重建缺失或内容已过期的 chunk embedding 索引。 */
export async function reindexOutdatedChunks(
  chunks: KnowledgeChunk[]
): Promise<ChunkEmbedding[]> {
  const outdatedChunks: KnowledgeChunk[] = [];

  for (const chunk of chunks) {
    if (!(await isChunkEmbeddingFresh(chunk))) {
      outdatedChunks.push(chunk);
    }
  }

  return indexChunks(outdatedChunks);
}

/** 读取当前可用的 chunk embedding，缺失或过期时自动重建。 */
export async function getOrIndexChunkEmbedding(
  chunk: KnowledgeChunk
): Promise<ChunkEmbedding> {
  const existingEmbedding = await getChunkEmbedding(chunk.id);

  if (
    existingEmbedding &&
    (await isChunkEmbeddingFresh(chunk, existingEmbedding))
  ) {
    return existingEmbedding;
  }

  return indexChunk(chunk);
}

/** 判断已有 embedding 是否仍匹配当前 chunk 内容和 embedding 模型。 */
export async function isChunkEmbeddingFresh(
  chunk: KnowledgeChunk,
  chunkEmbedding?: ChunkEmbedding
): Promise<boolean> {
  const currentEmbedding = chunkEmbedding ?? (await getChunkEmbedding(chunk.id));
  if (!currentEmbedding) return false;

  return (
    currentEmbedding.embeddingModel === MOCK_EMBEDDING_MODEL &&
    currentEmbedding.contentHash === computeChunkContentHash(chunk)
  );
}

/** 将数据库记录转换成 RAG 内部使用的 ChunkEmbedding。 */
function toChunkEmbedding(chunkEmbedding: {
  chunkId: string;
  embedding: string;
  embeddingModel: string;
  contentHash: string;
  updatedAt: Date;
}): ChunkEmbedding {
  return {
    chunkId: chunkEmbedding.chunkId,
    embedding: deserializeEmbedding(chunkEmbedding.embedding),
    embeddingModel: chunkEmbedding.embeddingModel,
    contentHash: chunkEmbedding.contentHash,
    updatedAt: chunkEmbedding.updatedAt.toISOString(),
  };
}

/** 将向量数组序列化成 SQLite 可存储的 JSON 字符串。 */
function serializeEmbedding(embedding: EmbeddingVector): string {
  return JSON.stringify(embedding);
}

/** 将 SQLite 中的 JSON 字符串还原成向量数组。 */
function deserializeEmbedding(value: string): EmbeddingVector {
  const parsedValue: unknown = JSON.parse(value);

  if (!Array.isArray(parsedValue)) return [];
  return parsedValue.filter((item): item is number => typeof item === "number");
}

/** 对字符串生成稳定、轻量的本地 hash。 */
function hashString(input: string): string {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
