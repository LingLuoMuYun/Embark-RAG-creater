import { RAG_CONFIG } from "@/server/services/rag/config";
import {
  tokenizeSearchText,
  type SearchToken,
} from "@/server/services/rag/text-match";
import type { KnowledgeChunk } from "@/features/rag/types";

/**
 * BM25 关键词检索模块。
 *
 * 职责：
 * 1. 将 query 和知识片段文本切成可匹配的轻量 token。
 * 2. 基于 BM25 计算关键词相关性分数。
 * 3. 输出带 rank/source 的结果，供 hybrid 模块和向量结果融合。
 */
export type Bm25SearchResult = {
  chunk: KnowledgeChunk;
  score: number;
  rank: number;
  source: "bm25";
};

type IndexedChunk = {
  chunk: KnowledgeChunk;
  termFrequency: Map<string, number>;
  length: number;
};

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * 使用 BM25 从给定 chunk 集合中召回关键词相关结果。
 *
 * title、summary、content 会按不同权重进入词频统计；
 * 适合补足向量检索对专有名词、文件名、角色名、功能名等精确词不稳定的问题。
 */
export function searchByBm25(
  chunks: KnowledgeChunk[],
  query: string
): Bm25SearchResult[] {
  const queryTerms = tokenizeForBm25(query);
  if (queryTerms.length === 0 || chunks.length === 0) return [];

  const indexedChunks = chunks.map(indexChunk);
  const averageLength =
    indexedChunks.reduce((sum, item) => sum + item.length, 0) /
    indexedChunks.length;
  const documentFrequency = getDocumentFrequency(indexedChunks);
  const uniqueQueryTerms = getUniqueTokens(queryTerms);

  return indexedChunks
    .map(({ chunk, termFrequency, length }) => {
      let score = 0;

      for (const term of uniqueQueryTerms) {
        const frequency = termFrequency.get(term.value) ?? 0;
        if (frequency === 0) continue;

        const df = documentFrequency.get(term.value) ?? 0;
        const idf = Math.log(
          1 + (indexedChunks.length - df + 0.5) / (df + 0.5)
        );
        const denominator =
          frequency +
          BM25_K1 *
            (1 - BM25_B + BM25_B * (length / Math.max(averageLength, 1)));

        score +=
          getQueryTermWeight(term) *
          idf *
          ((frequency * (BM25_K1 + 1)) / denominator);
      }

      return {
        chunk,
        score: Number(score.toFixed(4)),
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      source: "bm25" as const,
    }));
}

/** 将单个知识片段转换成 BM25 需要的词频索引结构。 */
function indexChunk(chunk: KnowledgeChunk): IndexedChunk {
  const termFrequency = new Map<string, number>();
  let length = 0;

  length += addWeightedTerms(
    termFrequency,
    tokenizeForBm25(chunk.title),
    RAG_CONFIG.bm25TitleWeight
  );
  length += addWeightedTerms(
    termFrequency,
    tokenizeForBm25(chunk.summary ?? ""),
    RAG_CONFIG.bm25SummaryWeight
  );
  length += addWeightedTerms(
    termFrequency,
    tokenizeForBm25(chunk.content),
    RAG_CONFIG.bm25ContentWeight
  );
  length += addWeightedTerms(
    termFrequency,
    tokenizeForBm25(getMetadataText(chunk)),
    RAG_CONFIG.bm25MetadataWeight
  );

  return {
    chunk,
    termFrequency,
    length,
  };
}

/** 统计每个 token 出现在多少个 chunk 中，用于计算 IDF。 */
function getDocumentFrequency(indexedChunks: IndexedChunk[]): Map<string, number> {
  const documentFrequency = new Map<string, number>();

  for (const indexedChunk of indexedChunks) {
    for (const term of indexedChunk.termFrequency.keys()) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return documentFrequency;
}

function addWeightedTerms(
  termFrequency: Map<string, number>,
  tokens: SearchToken[],
  weight: number
): number {
  let length = 0;

  for (const token of tokens) {
    const weightedTermFrequency = weight * getIndexTermWeight(token);
    termFrequency.set(
      token.value,
      (termFrequency.get(token.value) ?? 0) + weightedTermFrequency
    );
    length += weightedTermFrequency;
  }

  return length;
}

/** BM25 使用英文/数字标识符、中文 bigram 和 trigram 作为轻量关键词。 */
function tokenizeForBm25(input: string): SearchToken[] {
  return tokenizeSearchText(input, {
    cjkGramSizes: [2, 3],
    includeSingleCjk: true,
  });
}

function getIndexTermWeight(token: SearchToken): number {
  let weight = token.weight;

  if (token.kind === "cjk" && token.length >= 3) {
    weight *= RAG_CONFIG.bm25CjkLongTermWeight;
  }
  if (token.kind === "ascii" && token.isIdentifier) {
    weight *= RAG_CONFIG.bm25AsciiIdentifierWeight;
  }

  return weight;
}

function getQueryTermWeight(token: SearchToken): number {
  return getIndexTermWeight(token);
}

function getUniqueTokens(tokens: SearchToken[]): SearchToken[] {
  const tokensByValue = new Map<string, SearchToken>();

  for (const token of tokens) {
    const current = tokensByValue.get(token.value);

    if (!current || getQueryTermWeight(token) > getQueryTermWeight(current)) {
      tokensByValue.set(token.value, token);
    }
  }

  return Array.from(tokensByValue.values());
}

function getMetadataText(chunk: KnowledgeChunk): string {
  return chunk.metadata ? JSON.stringify(chunk.metadata) : "";
}
