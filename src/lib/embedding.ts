/**
 * DashScope Text Embedding 服务
 *
 * 通过阿里云百炼 DashScope HTTP API 将文本转换为向量。
 * 使用 text-embedding-v3 模型，默认维度 1024。
 *
 * API 文档：https://help.aliyun.com/zh/model-studio/text-embedding-api
 */

const DASHSCOPE_EMBEDDING_URL =
  "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding";

/** 单次请求最多发送的文本数量 */
const MAX_BATCH_SIZE = 20;

interface EmbeddingResponse {
  output?: {
    embeddings?: Array<{
      text_index: number;
      embedding: number[];
    }>;
  };
  code?: string;
  message?: string;
  request_id?: string;
}

/**
 * 对一批文本调用 Embedding API。
 * 返回与输入顺序一致的向量数组。
 */
async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error("DASHSCOPE_API_KEY is not set — 请在 .env 中配置阿里云百炼 API-KEY");
  }

  // DashScope API key 必须是纯 ASCII 字符，中文占位符会导致 HTTP 头编码错误
  if (!/^[\x00-\x7F]+$/.test(apiKey)) {
    throw new Error(
      "DASHSCOPE_API_KEY 包含非 ASCII 字符，请检查 .env 中是否已替换为真实的 API-KEY",
    );
  }

  const model = process.env.DASHSCOPE_EMBEDDING_MODEL || "text-embedding-v3";

  const response = await fetch(DASHSCOPE_EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: { texts },
      parameters: { dimension: 1024 },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `DashScope Embedding API error: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 300)}` : ""}`,
    );
  }

  const json: EmbeddingResponse = await response.json();

  if (json.code) {
    throw new Error(
      `DashScope Embedding error: code=${json.code}, message=${json.message ?? "unknown"}`,
    );
  }

  const embeddings = json.output?.embeddings;
  if (!embeddings || embeddings.length === 0) {
    throw new Error("DashScope Embedding returned empty embeddings");
  }

  // 按 text_index 排序，确保顺序与输入一致
  const sorted = [...embeddings].sort(
    (a, b) => a.text_index - b.text_index,
  );

  return sorted.map((e) => e.embedding);
}

/**
 * 将一批文本转为向量。
 * 自动分批，避免单次请求文本过多。
 *
 * @param texts - 文本数组
 * @returns 对应的向量数组，顺序与输入一致
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const vectors = await embedBatch(batch);
    results.push(...vectors);
  }

  return results;
}

/**
 * 将单个文本转为向量。
 */
export async function embedSingle(text: string): Promise<number[]> {
  const results = await embedTexts([text]);
  const vector = results[0];
  if (!vector) throw new Error("Failed to embed text");
  return vector;
}
