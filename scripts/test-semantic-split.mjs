// 测试语义分段
// 用法: 先配好 .env 里的 DASHSCOPE_API_KEY，然后 node scripts/test-semantic-split.mjs

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// 加载 .env
const envPath = resolve(root, ".env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

// 多话题测试文本
const testText = `React 是一个用于构建用户界面的 JavaScript 库。它由 Facebook 开发和维护，目前是前端开发中最流行的框架之一。React 采用组件化的开发方式，通过虚拟 DOM 来高效地更新页面。

useState 是 React 中最基本的 Hook，用于在函数组件中管理状态。useEffect 用于处理副作用，比如数据获取和订阅。useContext 则用于跨组件共享数据，避免了 props 逐层传递的问题。

Python 是一门简洁优雅的编程语言，广泛应用于数据科学、人工智能和 Web 开发领域。它拥有丰富的第三方库，如 NumPy、Pandas 和 TensorFlow。

在 Python 中，列表推导式是一种简洁的创建列表的方式。例如 [x**2 for x in range(10)] 可以快速生成平方数列表。字典是 Python 中重要的数据结构，使用键值对来存储数据。

Docker 是一个开源的容器化平台，可以将应用及其依赖打包成一个轻量级的容器。容器之间相互隔离，但可以共享操作系统内核，比传统虚拟机更加高效。

Kubernetes 是容器编排的事实标准，可以自动部署、扩展和管理容器化应用。它提供了服务发现、负载均衡和自动回滚等功能，是云原生架构的核心组件。`;

console.log("测试文本长度:", testText.length, "字符\n");

// 第一步：拆句
console.log("=== 第1步：拆句子 ===");
const sentences = splitSentences(testText);
console.log(`共 ${sentences.length} 句：`);
sentences.forEach((s, i) => console.log(`  [${i}] ${s.slice(0, 50)}...`));

// 第二步：向量化
console.log("\n=== 第2步：向量化 ===");
try {
  const embeddings = await batchEmbed(sentences);
  console.log(`获取了 ${embeddings.length} 个向量，维度: ${embeddings[0].embedding.length}`);

  // 第三步：计算相似度
  console.log("\n=== 第3步：相邻句相似度 ===");
  const sims = [];
  for (let i = 0; i < embeddings.length - 1; i++) {
    const sim = cosineSimilarity(embeddings[i].embedding, embeddings[i + 1].embedding);
    sims.push(sim);
    const bar = "█".repeat(Math.round(sim * 30));
    console.log(`  [${i}]→[${i + 1}]: ${sim.toFixed(3)} ${bar}`);
  }

  // 第四步：找切分点
  const sorted = [...sims].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.5)];
  console.log(`\n阈值（50%分位）: ${threshold.toFixed(3)}`);

  const breakpoints = [];
  for (let i = 0; i < sims.length; i++) {
    if (sims[i] < threshold) {
      breakpoints.push(i + 1);
    }
  }

  // 第五步：输出分段结果
  console.log("\n=== 第5步：分段结果 ===");
  const segments = [];
  let current = "";
  for (let i = 0; i < sentences.length; i++) {
    current += sentences[i];
    if (breakpoints.includes(i + 1) || i === sentences.length - 1) {
      if (current.trim()) segments.push(current.trim());
      current = "";
    }
  }

  segments.forEach((seg, i) => {
    console.log(`\n--- 段落 ${i + 1} (${seg.length} 字) ---`);
    console.log(seg.slice(0, 200) + (seg.length > 200 ? "..." : ""));
  });

  console.log(`\n✅ 语义分段完成！${segments.length} 个段落`);
} catch (err) {
  console.error("❌ 向量化失败:", err.message);
  console.log("请检查 .env 中的 DASHSCOPE_API_KEY 是否正确");
}

// ── helper functions (复刻 semantic-splitter & embedding 逻辑) ──

function splitSentences(text) {
  const raw = text.split(
    /(?<=[。！？\n])\s*|(?<!\d)(?<=[.!?])\s+(?=[A-Z一-鿿])/
  );
  return raw.map((s) => s.trim()).filter((s) => s.length > 0);
}

async function batchEmbed(texts) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY not set");

  const results = [];
  const batchSize = 10;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const resp = await fetch(
      "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-v4",
          input: { texts: batch },
        }),
      }
    );

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(`API ${resp.status}: ${JSON.stringify(data).slice(0, 200)}`);
    }

    for (const e of data.output?.embeddings || []) {
      results.push({
        embedding: e.embedding,
        textIndex: i + e.text_index,
      });
    }
  }
  return results;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
