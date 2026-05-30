import {
  ragEvalCases,
  type RetrievalEvalCase,
} from "@/server/services/rag/eval-cases";
import { retrieveRagContexts } from "@/server/services/rag/retriever";
import type { RagContext } from "@/features/rag/types";

export type RetrievalEvalCaseResult = {
  id: string;
  query: string;
  hit: boolean;
  recall: number;
  mrr: number;
  durationMs: number;
  returnedChunkIds: string[];
  returnedKnowledgeIds: string[];
};

export type RetrievalEvalReport = {
  k: number;
  total: number;
  hitAtK: number;
  recallAtK: number;
  mrrAtK: number;
  averageDurationMs: number;
  cases: RetrievalEvalCaseResult[];
};

/**
 * 离线评测入口。
 *
 * 初版只计算 Hit@K、Recall@K、MRR@K 和平均耗时；
 * 后续新增 BM25、混合检索或 rerank 后，可以复用它观察指标变化。
 */
export async function evaluateRetrieval(
  cases: RetrievalEvalCase[] = ragEvalCases,
  k = 5
): Promise<RetrievalEvalReport> {
  const results: RetrievalEvalCaseResult[] = [];

  for (const evalCase of cases) {
    const startedAt = Date.now();
    const response = await retrieveRagContexts(evalCase);
    const durationMs = Date.now() - startedAt;
    const topContexts = response.contexts.slice(0, k);
    const expectedKeys = getExpectedKeys(evalCase);
    const returnedKeys = topContexts.map(toContextKeySet);
    const firstHitIndex = returnedKeys.findIndex((keys) =>
      keys.some((key) => expectedKeys.has(key))
    );
    const matchedKeys = new Set<string>();

    for (const keys of returnedKeys) {
      for (const key of keys) {
        if (expectedKeys.has(key)) {
          matchedKeys.add(key);
        }
      }
    }

    results.push({
      id: evalCase.id,
      query: evalCase.query,
      hit: firstHitIndex >= 0,
      recall:
        expectedKeys.size === 0 ? 0 : matchedKeys.size / expectedKeys.size,
      mrr: firstHitIndex >= 0 ? 1 / (firstHitIndex + 1) : 0,
      durationMs,
      returnedChunkIds: topContexts.map((context) => context.chunkId),
      returnedKnowledgeIds: Array.from(
        new Set(topContexts.map((context) => context.knowledgeId))
      ),
    });
  }

  return {
    k,
    total: results.length,
    hitAtK: average(results.map((result) => (result.hit ? 1 : 0))),
    recallAtK: average(results.map((result) => result.recall)),
    mrrAtK: average(results.map((result) => result.mrr)),
    averageDurationMs: average(results.map((result) => result.durationMs)),
    cases: results,
  };
}

export function formatEvaluationReport(report: RetrievalEvalReport): string {
  const lines = [
    `RAG retrieval evaluation @${report.k}`,
    `Total: ${report.total}`,
    `Hit@${report.k}: ${formatMetric(report.hitAtK)}`,
    `Recall@${report.k}: ${formatMetric(report.recallAtK)}`,
    `MRR@${report.k}: ${formatMetric(report.mrrAtK)}`,
    `Avg duration: ${report.averageDurationMs.toFixed(1)}ms`,
    "",
    "Cases:",
  ];

  for (const result of report.cases) {
    lines.push(
      `- ${result.id}: hit=${result.hit ? "yes" : "no"}, recall=${formatMetric(
        result.recall
      )}, mrr=${formatMetric(result.mrr)}, duration=${result.durationMs}ms`
    );
  }

  return lines.join("\n");
}

function getExpectedKeys(evalCase: RetrievalEvalCase): Set<string> {
  return new Set([
    ...(evalCase.expectedChunkIds ?? []).map((id) => `chunk:${id}`),
    ...(evalCase.expectedKnowledgeIds ?? []).map((id) => `knowledge:${id}`),
  ]);
}

function toContextKeySet(context: RagContext): string[] {
  return [`chunk:${context.chunkId}`, `knowledge:${context.knowledgeId}`];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatMetric(value: number): string {
  return value.toFixed(3);
}
