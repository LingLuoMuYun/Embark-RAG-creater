import { RAG_CONFIG } from "@/server/services/rag/config";

export type ProcessedQuery = {
  originalQuery: string;
  normalizedQuery: string;
  expandedQueries: string[];
  retrievalQueries: string[];
};

const QUESTION_SUFFIX_PATTERN =
  /(吗|呢|么|嘛|吗？|呢？|么？|嘛？|如何|怎么|怎样)$/;

const QUERY_REWRITE_RULES: Array<[RegExp, string[]]> = [
  [/怎么|怎样|如何/g, ["怎么", "如何", "怎样"]],
  [/配置|设置|分配|修改|更改|改/g, ["配置", "设置", "分配", "修改"]],
  [/权限|角色|管理员/g, ["权限", "角色", "管理员"]],
  [/成员|用户|账号|账户/g, ["成员", "用户", "账号"]],
  [/删除|移除|禁用/g, ["删除", "移除", "禁用"]],
];

/**
 * query 处理模块。
 *
 * 职责：
 * 1. 对用户原始问题做轻量标准化。
 * 2. 基于规则生成少量等价检索 query。
 * 3. 输出 retrievalQueries 给向量检索和 BM25 共同使用。
 */
export function processQuery(query: string): ProcessedQuery {
  const originalQuery = query;
  const normalizedQuery = normalizeQuery(query);
  const expandedQueries = RAG_CONFIG.queryExpansionEnabled
    ? expandQuery(normalizedQuery)
    : [];
  const retrievalQueries = uniqueNonEmpty([
    originalQuery,
    normalizedQuery,
    ...expandedQueries,
  ]).slice(0, RAG_CONFIG.maxExpandedQueries + 2);

  return {
    originalQuery,
    normalizedQuery,
    expandedQueries,
    retrievalQueries,
  };
}

/**
 * 标准化用户问题。
 *
 * 目前只做安全的文本清理：统一空白、全角符号和常见问句后缀；
 * 不改变业务含义，避免把用户原问题改坏。
 */
export function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/[？?！!。；;]/g, " ")
    .replace(/\s+/g, " ")
    .replace(QUESTION_SUFFIX_PATTERN, "")
    .trim();
}

/**
 * 基于固定规则生成扩展 query。
 *
 * 初版不依赖 LLM，只围绕常见问法和权限领域词做扩展；
 * 后续可以把 LLM 改写结果合并进这里。
 */
export function expandQuery(query: string): string[] {
  const expansions: string[] = [];

  for (const [pattern, replacements] of QUERY_REWRITE_RULES) {
    pattern.lastIndex = 0;
    if (!pattern.test(query)) continue;
    pattern.lastIndex = 0;

    for (const replacement of replacements) {
      const expandedQuery = query.replace(pattern, replacement).trim();
      if (expandedQuery !== query) {
        expansions.push(expandedQuery);
      }
    }
  }

  return uniqueNonEmpty(expansions).slice(0, RAG_CONFIG.maxExpandedQueries);
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
