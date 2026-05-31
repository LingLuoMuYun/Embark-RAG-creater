# 成员 F：Agent 问答消费功能总结

## 1. 负责范围

本次新增功能聚焦在知识消费侧，负责把专家 Agent 配置、RAG 检索结果和多轮对话上下文组装起来，完成可追溯的 Agent 问答流程。

对应分工：

```text
成员 F：Agent 问答消费与引用
关键词：上下文组装、多轮对话、引用回答
```

本模块不负责知识入库、知识审核、分类标签管理或 Agent 配置创建，这些能力继续复用其他成员已提供的模块。

## 2. 已实现功能

### 2.1 Agent 聊天页面

新增页面：

```text
/agents/chat
```

主要能力：

- 自动加载已启用的 Agent。
- 支持通过 `agentId` query 参数进入指定 Agent 对话。
- 支持切换 Agent。
- 支持新建会话。
- 展示历史会话列表。
- 展示用户消息和助手消息。
- 展示回答引用来源。
- 支持流式回答展示。
- 支持 loading、empty、error 状态。

相关文件：

```text
src/app/agents/chat/page.tsx
```

同时在 Agent 管理页增加了入口：

```text
src/app/agents/page.tsx
src/features/agent/components/agent-list.tsx
```

只有 `active` 状态的 Agent 可以直接进入对话。

### 2.2 会话管理

新增会话模型 `AgentConversation`，用于保存每个 Agent 下的多轮对话。

字段重点：

- `agentId`：所属 Agent。
- `title`：会话标题，默认由用户首条问题截断生成。
- `memorySummary`：长期记忆摘要。
- `memoryCursorMessageId`：已压缩到长期记忆的消息游标。
- `memoryFailureCount`：Memory 压缩失败次数。
- `status`：会话状态，当前默认 `active`。

新增接口：

```http
GET /api/agents/[id]/conversations
```

作用：

- 获取指定 Agent 的历史会话列表。
- 按更新时间倒序返回。
- 支持 `page` 和 `pageSize`。

### 2.3 消息持久化

新增消息模型 `AgentMessage`，用于保存用户问题、助手回答和引用信息。

字段重点：

- `conversationId`：所属会话。
- `role`：消息角色，当前使用 `user` / `assistant`。
- `content`：消息正文。
- `citationsJson`：助手回答引用来源 JSON。
- `createdAt`：消息创建时间。

新增接口：

```http
GET /api/conversations/[id]/messages
```

作用：

- 获取某个会话下的历史消息。
- 按创建时间升序返回。
- 助手消息会携带引用来源。

### 2.4 Agent 流式问答

新增接口：

```http
POST /api/agents/[id]/chat
Content-Type: application/json
```

请求体：

```json
{
  "message": "如何给成员配置管理员权限？",
  "conversationId": "可选，继续已有会话时传入"
}
```

响应方式：

```text
text/event-stream
```

服务端会返回以下 SSE 事件：

| 事件 | 说明 |
| --- | --- |
| `meta` | 返回 `conversationId` 和 `agentId` |
| `citations` | 返回本次检索到的引用来源 |
| `token` | 流式返回 LLM 生成内容 |
| `done` | 回答完成 |
| `error` | 回答失败 |

该接口完成的流程：

```text
校验 Agent
→ 获取或创建会话
→ 读取历史消息
→ 必要时压缩长期记忆
→ 将 Agent knowledgeScope 转成 RAG scope
→ 调用 RAG 检索
→ 组装 system prompt、历史记忆、最近对话和知识上下文
→ 调用 LLM 流式生成
→ 持久化用户消息和助手回答
→ 保存引用来源
```

### 2.5 上下文组装

上下文组装逻辑位于：

```text
src/server/services/agent/agent-chat.service.ts
```

组装内容包括：

- Agent 的 `systemPrompt`
- Agent 的回答风格 `answerStyle`
- 长期记忆摘要 `memorySummary`
- 最近若干轮对话
- RAG 检索返回的 `llmContext`
- 当前用户问题

核心约束：

- 只能基于知识库检索结果和必要历史对话回答。
- 使用知识时要求保留 `[ref_x]` 引用标记。
- 知识库没有可靠依据时，需要明确说明没有找到可靠依据。
- 不允许编造引用编号。

### 2.6 RAG 检索对接

本模块复用当前项目已有 RAG 检索链路：

```text
src/server/services/rag/retriever.ts
```

Agent 侧不会自己实现检索算法，而是将 Agent 配置中的 `knowledgeScope` 转成 RAG scope 后调用：

```ts
retrieveRagContexts({
  query,
  mode: "balanced",
  scope,
});
```

这符合 `docs/知识入库字段建议以及请求检索接口对接文档.md` 中的约定：

- Agent 侧只传 `query` 和 `scope`。
- RAG 模块返回 `contexts`、`llmContext` 和 `references`。
- 引用编号需要和 `llmContext` 中的 `[ref_n]` 对齐。
- Agent 只能使用 `available` 状态的知识。

### 2.7 引用回答

助手回答的引用来源来自 RAG 返回的 `contexts` 和 `references`。

前端展示内容包括：

- 引用编号，例如 `[ref_1]`
- 来源标题
- chunk 内容摘要
- 相关性分数

引用数据会随助手消息持久化到 `AgentMessage.citationsJson`，后续打开历史会话时仍可展示引用来源。

### 2.8 对话 Memory 压缩

当历史消息超过上下文阈值时，系统会尝试将较早的消息压缩成长期记忆摘要。

相关字段：

```text
AgentConversation.memorySummary
AgentConversation.memoryCursorMessageId
AgentConversation.memoryFailureCount
```

压缩策略：

- 保留最近若干轮消息作为短期上下文。
- 将更早且可压缩的消息交给 LLM 生成摘要。
- 摘要保留用户目标、已确认事实、关键约束和未解决问题。
- 如果连续压缩失败，会降级把原始片段写入 fallback memory，避免上下文丢失。

## 3. 新增数据模型

新增位置：

```text
prisma/schema.prisma
```

新增模型：

```prisma
model AgentConversation {
  id                    String  @id @default(cuid())
  agentId               String
  title                 String
  memorySummary         String?
  memoryCursorMessageId String?
  memoryFailureCount    Int     @default(0)
  status                String  @default("active")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  agent    ExpertAgent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  messages AgentMessage[]
}

model AgentMessage {
  id             String  @id @default(cuid())
  conversationId String
  role           String
  content        String
  citationsJson  String?

  createdAt DateTime @default(now())

  conversation AgentConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
}
```

并在 `ExpertAgent` 上增加：

```prisma
conversations AgentConversation[]
```

## 4. 新增文件清单

```text
src/app/agents/chat/page.tsx
src/app/api/agents/[id]/chat/route.ts
src/app/api/agents/[id]/conversations/route.ts
src/app/api/conversations/[id]/messages/route.ts
src/features/agent/agent-chat.types.ts
src/features/agent/agent-chat.validation.ts
src/server/services/agent/agent-chat.service.ts
src/server/services/agent/llm-client.ts
```

## 5. 环境变量

新增 LLM 配置示例：

```env
LLM_BASE_URL="https://api.openai.com/v1"
LLM_API_KEY=""
LLM_MODEL=""
```

说明：

- `LLM_BASE_URL` 支持 OpenAI 兼容接口。
- `LLM_API_KEY` 不应提交真实密钥。
- `LLM_MODEL` 需要按实际部署或平台模型填写。

## 6. 与其他成员模块的边界

### 6.1 依赖成员 E

读取 Agent 配置：

- Agent 名称
- Agent 描述
- `answerStyle`
- `knowledgeScope`
- `systemPrompt`
- `showReferences`
- `allowKnowledgeCapture`
- `status`

只有 `status === "active"` 的 Agent 可以进入问答。

### 6.2 依赖成员 B / RAG

调用 RAG 检索获取知识上下文：

- 不直接实现知识筛选算法。
- 不直接读取分类、标签管理逻辑。
- 不重复实现 BM25、向量检索或 rerank。

### 6.3 预留成员 A / G 接口

当前引用展示只展示 chunk 来源信息。

后续如果成员 A 提供知识详情接口，可以扩展：

- 点击引用查看知识详情。
- 展示知识状态、来源、更新时间。

后续如果成员 G 做知识闭环，可以扩展：

- 未命中问题记录。
- 高价值对话沉淀为待审核知识。
- Agent 使用次数和引用次数统计。

## 7. 验证结果

已执行：

```bash
npm run db:generate
npm run db:push
npm run lint
npm run build
```

结果：

- Prisma Client 生成成功。
- 本地 SQLite schema 同步成功。
- ESLint 通过。
- Next.js 构建通过。

构建时有一个现有环境提示：

```text
Next.js inferred your workspace root, but it may not be correct.
Detected multiple lockfiles.
```

该提示与本次 Agent 问答功能无关，是工作区上层存在多个 lockfile 导致的 Turbopack root 推断提醒。

## 8. 演示建议

演示流程：

1. 进入 `/agents`。
2. 创建或确认存在一个 `active` 状态的 Agent。
3. 确认 Agent 已配置知识库范围。
4. 点击 Agent 列表中的“对话”。
5. 在 `/agents/chat` 输入问题。
6. 查看流式回答和引用来源。
7. 刷新页面或重新进入会话，确认历史消息和引用仍可展示。

如果没有配置真实 LLM 环境变量，聊天接口会提示 `LLM_API_KEY 未配置` 或 `LLM_MODEL 未配置`，这是预期行为。
