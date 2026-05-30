/**
 * LLM query rewrite 预留模块。
 *
 * 当前阶段不接真实 LLM API，避免提前引入 API Key、费用和网络依赖。
 * 后续如果需要接 OpenAI、Voyage 或其他模型，可以实现这个函数，
 * 并把结果合并到 query-processor 的 expandedQueries 中。
 */
export async function rewriteQueryWithLlm(
  query: string
): Promise<string[]> {
  void query;
  return [];
}
