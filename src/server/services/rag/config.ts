// RAG 内部策略参数集中放这里，避免 topK、阈值等实现细节泄漏给调用方。
export const RAG_CONFIG = {
  fastTopK: 3,
  topK: 5,
  detailedTopK: 8,
  minScore: 0.01,
  maxContextChars: 6000,
} as const;
