import { RAG_CONFIG } from "@/server/services/rag/config";
import {
  countAsciiTokenMatches,
  countSubstringMatches,
  getCjkText,
  normalizeCompactAsciiText,
  normalizeSearchText,
  tokenizeAscii,
  tokenizeSearchText,
  type SearchToken,
} from "@/server/services/rag/text-match";
import type { KnowledgeChunk } from "@/features/rag/types";

/**
 * 精确词检索模块。
 *
 * 职责：
 * 1. 补足 BM25 和向量检索对短精确词、文件名、角色名等命中的不稳定性。
 * 2. 对 title / summary / content / metadata 做字段加权精确匹配。
 * 3. 输出带 rank/source 的结果，供 RRF 与其他召回链路融合。
 */
export type ExactTermSearchResult = {
  chunk: KnowledgeChunk;
  score: number;
  rank: number;
  source: "exact";
};

type ExactTerm = SearchToken;

type QueryProfile = {
  phrase: string;
  terms: ExactTerm[];
};

type SearchField = {
  text: string;
  weight: number;
  phraseBoost: number;
};

export function searchByExactTerms(
  chunks: KnowledgeChunk[],
  query: string
): ExactTermSearchResult[] {
  if (!RAG_CONFIG.exactTermSearchEnabled || chunks.length === 0) return [];

  const queryProfile = buildQueryProfile(query);
  if (!queryProfile.phrase && queryProfile.terms.length === 0) return [];

  return chunks
    .map((chunk) => ({
      chunk,
      score: Number(scoreChunk(chunk, queryProfile).toFixed(4)),
    }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      source: "exact" as const,
    }));
}

function buildQueryProfile(query: string): QueryProfile {
  const phrase = normalizeSearchText(query);
  const terms = tokenizeSearchText(query, {
    cjkGramSizes: [4, 3, 2],
    includeSingleCjk: true,
    maxTokens: RAG_CONFIG.maxExactTerms,
  });

  return {
    phrase,
    terms,
  };
}

function scoreChunk(chunk: KnowledgeChunk, queryProfile: QueryProfile): number {
  return getSearchFields(chunk).reduce(
    (score, field) => score + scoreField(field, queryProfile),
    0
  );
}

function getSearchFields(chunk: KnowledgeChunk): SearchField[] {
  return [
    {
      text: chunk.title,
      weight: RAG_CONFIG.exactTitleWeight,
      phraseBoost: RAG_CONFIG.exactTitlePhraseBoost,
    },
    {
      text: chunk.summary ?? "",
      weight: RAG_CONFIG.exactSummaryWeight,
      phraseBoost: RAG_CONFIG.exactSummaryPhraseBoost,
    },
    {
      text: chunk.content,
      weight: RAG_CONFIG.exactContentWeight,
      phraseBoost: RAG_CONFIG.exactContentPhraseBoost,
    },
    {
      text: chunk.metadata ? JSON.stringify(chunk.metadata) : "",
      weight: RAG_CONFIG.exactMetadataWeight,
      phraseBoost: RAG_CONFIG.exactMetadataPhraseBoost,
    },
  ];
}

function scoreField(field: SearchField, queryProfile: QueryProfile): number {
  if (!field.text.trim()) return 0;

  const normalizedText = normalizeSearchText(field.text);
  const compactAsciiText = normalizeCompactAsciiText(field.text);
  const asciiTokens = tokenizeAscii(normalizedText);
  const cjkText = getCjkText(normalizedText);
  let score = 0;

  if (
    queryProfile.phrase.length >= 2 &&
    normalizedText.includes(queryProfile.phrase)
  ) {
    score += RAG_CONFIG.exactPhraseWeight * field.phraseBoost;
  }

  for (const term of queryProfile.terms) {
    const matchCount =
      term.kind === "ascii"
        ? countAsciiMatches(asciiTokens, compactAsciiText, term.value)
        : countSubstringMatches(cjkText, term.value);

    if (matchCount > 0) {
      score +=
        getExactTermWeight(term) *
        Math.min(matchCount, RAG_CONFIG.exactMaxFieldMatches);
    }
  }

  return score * field.weight;
}

function countAsciiMatches(
  tokens: string[],
  compactAsciiText: string,
  term: string
): number {
  const tokenMatches = countAsciiTokenMatches(tokens, term);
  if (tokenMatches > 0) return tokenMatches;
  return countSubstringMatches(compactAsciiText, term);
}

function getExactTermWeight(term: ExactTerm): number {
  let weight = term.weight;

  if (term.kind === "cjk" && term.length >= 3) {
    weight *= RAG_CONFIG.exactCjkLongTermWeight;
  }
  if (term.kind === "ascii" && term.isIdentifier) {
    weight *= RAG_CONFIG.exactAsciiIdentifierWeight;
  }

  return weight;
}
