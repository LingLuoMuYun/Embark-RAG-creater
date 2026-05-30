import type { KnowledgeChunk } from "@/features/rag/types";

const MOCK_EMBEDDING_DIMENSION = 64;

/**
 * embedding 生成模块。
 *
 * 职责：
 * 1. 为 query 和 chunk 生成稳定的 mock 向量。
 * 2. 保持和未来真实 embedding API 相同的调用入口。
 * 3. 让当前 RAG 检索链路在没有 API Key 的情况下也能完整跑通。
 */
export type EmbeddingVector = number[];

/**
 * 稳定的 mock query embedding。
 *
 * 这里不依赖外部模型，保证同一输入每次得到同一向量；
 * 后续接真实 embedding 模型时保留函数签名即可。
 */
export function embedQuery(query: string): EmbeddingVector {
  return embedText(query);
}

/**
 * 稳定的 mock chunk embedding。
 *
 * 初版把标题、摘要、正文和 metadata 合成索引文本，标题和摘要重复一次提高权重。
 */
export function embedChunk(chunk: KnowledgeChunk): EmbeddingVector {
  const metadataText = chunk.metadata ? JSON.stringify(chunk.metadata) : "";
  return embedText(
    [
      chunk.title,
      chunk.title,
      chunk.summary ?? "",
      chunk.summary ?? "",
      chunk.content,
      metadataText,
    ].join("\n")
  );
}

/** 将任意文本转换成固定维度的 mock embedding 向量。 */
function embedText(text: string): EmbeddingVector {
  const vector = new Array<number>(MOCK_EMBEDDING_DIMENSION).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const hash = hashToken(token);
    const index = Math.abs(hash) % MOCK_EMBEDDING_DIMENSION;
    vector[index] += 1;
  }

  return normalizeVector(vector);
}

/** 轻量分词：英文/数字按词，中文按相邻双字 bigram。 */
function tokenize(input: string): string[] {
  const normalized = input.toLowerCase().trim();
  const asciiTokens = normalized.match(/[a-z0-9_]+/g) ?? [];
  const cjkText = Array.from(normalized)
    .filter((char) => /[\u4e00-\u9fff]/.test(char))
    .join("");
  const cjkTokens: string[] = [];

  if (cjkText.length === 1) {
    cjkTokens.push(cjkText);
  }

  for (let index = 0; index < cjkText.length - 1; index += 1) {
    cjkTokens.push(cjkText.slice(index, index + 2));
  }

  return [...asciiTokens, ...cjkTokens];
}

/** 将 token 稳定映射到固定维度向量中的某个位置。 */
function hashToken(token: string): number {
  let hash = 0;

  for (let index = 0; index < token.length; index += 1) {
    hash = (hash << 5) - hash + token.charCodeAt(index);
    hash |= 0;
  }

  return hash;
}

/** 对向量做 L2 归一化，方便后续计算余弦相似度。 */
function normalizeVector(vector: EmbeddingVector): EmbeddingVector {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0)
  );

  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}
