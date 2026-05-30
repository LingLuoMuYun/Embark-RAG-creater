// RAG 内部策略参数集中放这里，避免 topK、阈值等实现细节泄漏给调用方。
export const RAG_CONFIG = {
  fastTopK: 3,
  topK: 5,
  detailedTopK: 8,
  candidateMultiplier: 4,
  minScore: 0.01,
  maxContextChars: 6000,
  rrfK: 60,
  bm25TitleWeight: 2,
  bm25SummaryWeight: 1.5,
  bm25ContentWeight: 1,
  queryExpansionEnabled: true,
  maxExpandedQueries: 4,
} as const;
