import type { KnowledgeChunk } from "@/features/rag/types";

const MOCK_EMBEDDING_DIMENSION = 64;

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

function hashToken(token: string): number {
  let hash = 0;

  for (let index = 0; index < token.length; index += 1) {
    hash = (hash << 5) - hash + token.charCodeAt(index);
    hash |= 0;
  }

  return hash;
}

function normalizeVector(vector: EmbeddingVector): EmbeddingVector {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0)
  );

  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}
