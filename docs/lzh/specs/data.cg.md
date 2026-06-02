# 数据结构并拢改造 Spec

## 1. 目标

本次改造将当前重复的“文档/分片/向量/候选知识”数据结构并拢为一套主模型，降低后续 RAG 管理、文档上传、检索消费和数据分析之间的适配成本。

采用方案 A：

- 以 `DocumentSource` 作为唯一文档主表。
- 以 `DocumentChunk` 作为唯一分片主表。
- `KnowledgeBaseDocument` 继续作为知识库与文档的关联表。
- 删除 `KnowledgeDocument`、`KnowledgeChunk`、`ChunkEmbedding`、`CandidateKnowledge`。
- 删除 `KnowledgeBase.chunkSize` 和 `KnowledgeBase.chunkOverlap`。
- 将向量直接存入 `DocumentChunk.embedding`。
- 在 `DocumentChunk` 增加 AI 归纳字段 `category` 和 `type`。
- 补齐 `DocumentSource` 字段，使其能兼容原 `KnowledgeDocument` 的 RAG 文档语义。

## 2. 改造原则

1. 不再维护两套文档模型。
2. 不再维护两套 chunk 模型。
3. 不再单独维护 `ChunkEmbedding` 表。当前业务默认一条 chunk 对应一份 embedding。
4. `KnowledgeBaseDocument.knowledgeBaseId` 必须保留，它是关联表表达“哪个知识库绑定了哪个文档”的必要字段。
5. `KnowledgeBaseDocument.documentId` 改为指向 `DocumentSource.id`。
6. 业务枚举仍遵循当前项目风格，在 Prisma 中使用 `String`，在 Zod/API 层做约束。
7. 改造后所有真实业务接口都应消费新结构，而不是保留旧表做适配层。

## 3. 目标 Prisma 模型

### 3.1 KnowledgeBase

删除 `chunkSize` 和 `chunkOverlap`。

```prisma
model KnowledgeBase {
  id          String  @id @default(cuid())
  name        String  @unique
  description String?

  icon  String @default("Database")
  color String @default("blue")

  similarityThreshold Float @default(0.7)
  topK                Int   @default(5)

  status String @default("active")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  documents KnowledgeBaseDocument[]

  @@index([status])
}
```

切片参数不再放在知识库表中。若后续仍需要切片配置，应放到上传/解析请求参数或 `DocumentSource` 文档级字段中。

### 3.2 KnowledgeBaseDocument

保留 `knowledgeBaseId`，将 `documentId` 关联到 `DocumentSource.id`。

```prisma
model KnowledgeBaseDocument {
  id              String @id @default(cuid())
  knowledgeBaseId String
  documentId      String

  status    String @default("active")
  sortOrder Int    @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  knowledgeBase KnowledgeBase  @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)
  document      DocumentSource @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([knowledgeBaseId, documentId])
  @@index([knowledgeBaseId])
  @@index([documentId])
  @@index([status])
}
```

### 3.3 DocumentSource

作为唯一文档表。保留上传解析字段，并增加反向关系 `knowledgeBases`。

```prisma
model DocumentSource {
  id           String   @id @default(cuid())
  title        String
  sourceType   String   @default("manual")
  originalName String?
  fileType     String?
  fileName     String?
  fileUrl      String?
  mimeType     String?
  fileSize     Int?
  status       String   @default("uploading")
  content      String?
  rawContent   String?
  parseStatus  String   @default("pending")
  errorMessage String?
  chunkCount   Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  chunks         DocumentChunk[]
  knowledgeBases KnowledgeBaseDocument[]

  @@index([status])
}
```

`DocumentSource` 对外承担原 `KnowledgeDocument` 的业务角色。前端和 API 可以继续把它展示为“知识文档”，但数据库模型不再使用 `KnowledgeDocument`。

兼容字段映射：

| 原 `KnowledgeDocument` 字段 | 新 `DocumentSource` 字段 | 说明 |
| --- | --- | --- |
| `title` | `title` | RAG 文档标题。 |
| `sourceType` | `sourceType` | 来源类型，例如 `manual`、`file`、`url`、`markdown`。 |
| `fileName` | `fileName` / `originalName` | 文件来源可同时写入两者；展示优先使用 `title`。 |
| `fileUrl` | `fileUrl` | URL 或文件访问地址。 |
| `mimeType` | `mimeType` | MIME 类型。 |
| `fileSize` | `fileSize` | 文件大小。 |
| `rawContent` | `rawContent` / `content` | 为兼容两侧接口可同时写入；检索切片优先基于 `content ?? rawContent`。 |
| `parseStatus` | `parseStatus` | 解析状态。 |
| `status` | `status` | 文档业务状态。 |
| `error` | `errorMessage` | 错误信息。 |

写入规则：

- `title` 必填。文件上传时如果调用方未传 `title`，服务端使用 `originalName` 或 `fileName` 兜底。
- `content` 和 `rawContent` 为兼容字段。解析成功后两者可以写同一份全文文本；后续新逻辑优先读取 `content`。

### 3.4 DocumentChunk

作为唯一分片表。增加 `embedding`、`category`、`type`。

```prisma
model DocumentChunk {
  id               String   @id @default(cuid())
  documentSourceId String
  chunkIndex       Int
  content          String
  charStart        Int?
  charEnd          Int?

  embedding String?
  category  String?
  type      String  @default("note")

  status    String   @default("active")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  documentSource DocumentSource @relation(fields: [documentSourceId], references: [id], onDelete: Cascade)

  @@index([documentSourceId])
  @@index([documentSourceId, chunkIndex])
  @@index([status])
  @@index([type])
  @@index([category])
}
```

字段说明：

- `embedding`：该 chunk 的向量，建议存 JSON 序列化后的 number array。
- `category`：AI 总结时填入的分类文本。默认 `null`，表示未定义。
- `type`：AI 总结时填入的知识类型。允许值由 Zod 校验：`faq | concept | procedure | note | summary`。
- `status`：分片状态，默认 `active`，用于替代旧 `KnowledgeChunk.status`。
- `charStart` / `charEnd`：原文字符位置，可选。手动创建、AI 生成或摘要类 chunk 允许为空。

### 3.5 UsageReference

`UsageReference` 保留引用追踪能力，但类型字段调整为新语义。为兼容旧业务，短期同时保留 `type` 和 `chunkType`。

```prisma
model UsageReference {
  id         String @id @default(cuid())
  usageLogId String

  knowledgeBaseId String
  knowledgeId     String
  chunkId         String
  title           String
  type            String
  chunkType       String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  usageLog UsageLog @relation(fields: [usageLogId], references: [id], onDelete: Cascade)

  @@index([usageLogId])
  @@index([knowledgeBaseId])
  @@index([knowledgeId])
  @@index([chunkId])
  @@index([type])
  @@index([chunkType])
}
```

字段语义：

- `knowledgeId`：指向 `DocumentSource.id`。
- `chunkId`：指向 `DocumentChunk.id`。
- `type`：新 chunk 类型字段，值域为 `faq | concept | procedure | note | summary`。
- `chunkType`：旧兼容字段，短期保留，写入时与 `type` 同值；读取时优先使用 `type`。

### 3.6 删除模型

从 schema 中删除：

```txt
KnowledgeDocument
KnowledgeChunk
ChunkEmbedding
CandidateKnowledge
```

删除后不再保留旧表适配层。

## 4. API 路径与语义调整

接口路径可以继续保持现有业务路径，但内部数据源必须切换到新模型。

### 4.1 知识库列表

保持：

```txt
GET /api/rag-management/knowledge-bases
POST /api/rag-management/knowledge-bases
PATCH /api/rag-management/knowledge-bases/:id
DELETE /api/rag-management/knowledge-bases/:id
```

变化：

- 列表统计 `documentCount` 从 `KnowledgeBaseDocument` 统计。
- `chunkCount` 从关联的 `DocumentSource.chunks` 统计。
- 创建/编辑知识库不再接收或写入 `chunkSize`、`chunkOverlap`。

### 4.2 知识库文档树

保持：

```txt
GET /api/rag-management/knowledge-bases/:id/tree
GET /api/rag-management/knowledge-bases/:id/documents
POST /api/rag-management/knowledge-bases/:id/documents
DELETE /api/rag-management/knowledge-bases/:id/documents
```

变化：

- 返回的 documents 来自 `KnowledgeBaseDocument.document -> DocumentSource`。
- 每个 document 的 chunks 来自 `DocumentSource.chunks`。
- `relationId` 仍来自 `KnowledgeBaseDocument.id`。
- 绑定文档时传入的 `documentIds` 指向 `DocumentSource.id`。

### 4.3 文档接口

现有 RAG 文档接口语义切换为 `DocumentSource`：

```txt
GET /api/rag-management/documents
POST /api/rag-management/documents
GET /api/rag-management/documents/:id
PATCH /api/rag-management/documents/:id
DELETE /api/rag-management/documents/:id
GET /api/rag-management/documents/:id/chunks
PUT /api/rag-management/documents/:id/chunks
```

变化：

- `:id` 指向 `DocumentSource.id`。
- 创建文档写入 `DocumentSource`。
- 替换 chunks 写入 `DocumentChunk`。
- 删除文档时级联删除 `DocumentChunk`，并级联删除 `KnowledgeBaseDocument` 关系。

### 4.4 原上传解析接口

保留：

```txt
GET /api/documents
POST /api/documents
GET /api/documents/:id
DELETE /api/documents/:id
POST /api/documents/:id/parse
GET /api/documents/:id/chunks
```

变化：

- 这些接口与 RAG 文档接口消费同一张 `DocumentSource` / `DocumentChunk`。
- 不再需要转换为 `KnowledgeDocument` / `KnowledgeChunk`。
- 如果一个文档需要进入某个知识库，创建或解析完成后通过 `KnowledgeBaseDocument` 绑定。

### 4.5 候选知识接口

`CandidateKnowledge` 删除后，现有候选知识页面或接口需要改造：

- 如果候选知识能力暂时不需要，删除对应 API、页面入口、store slice 和服务代码。
- 如果仍需要 AI 提炼结果，不再单独落 `CandidateKnowledge`，而是直接写入 `DocumentChunk.category`、`DocumentChunk.type`、`DocumentChunk.content`，或生成新的 `DocumentChunk`。

本次并拢方案默认：候选知识表和相关持久化能力不再保留。

AI 提炼接口调整：

```txt
POST /api/ai/extract/from-text
POST /api/ai/extract/from-document
POST /api/ai/extract/retry
```

这些接口不再返回或持久化 candidate rows。它们应返回并写入目标 chunk：

```ts
type ExtractedChunk = {
  documentSourceId: string;
  content: string;
  category?: string | null;
  type: "faq" | "concept" | "procedure" | "note" | "summary";
};
```

写入规则：

- 从文档提炼：写入指定 `DocumentSource` 下的新 `DocumentChunk`，或更新调用方指定的 chunk。
- 从文本提炼：如果没有现成 `DocumentSource`，先创建一个 `sourceType = "manual"` 或 `sourceType = "ai"` 的 `DocumentSource`，再写入 chunks。
- retry：不再重试 candidate，而是重新生成并覆盖/追加目标 `DocumentChunk`。

## 5. 服务层改造范围

### 5.1 RAG 管理服务

需要修改：

```txt
src/features/knowledge-bases/server/schemas.ts
src/features/knowledge-bases/server/mappers.ts
src/features/knowledge-bases/server/knowledge-base-service.ts
src/features/knowledge-bases/server/knowledge-document-service.ts
src/features/knowledge-bases/server/knowledge-chunk-service.ts
```

目标：

- 所有 `prisma.knowledgeDocument` 改为 `prisma.documentSource`。
- 所有 `prisma.knowledgeChunk` 改为 `prisma.documentChunk`。
- 所有 chunk schema 增加 `embedding`、`category`、`type`。
- `type` 用 Zod 限制为 `faq | concept | procedure | note | summary`。
- mapper 保持前端字段兼容，必要时把 `DocumentSource.originalName` 映射为前端文档标题或名称。

### 5.2 RAG 检索服务

需要修改：

```txt
src/server/services/rag/chunk-repository.ts
src/server/services/rag/vector-index-repository.ts
src/server/services/rag/vector-store.ts
src/server/services/rag/retriever.ts
src/server/services/rag/context-builder.ts
src/server/services/rag/context-expander.ts
src/server/services/rag/rules-reranker.ts
src/features/rag/types.ts
```

目标：

- 检索范围通过 `KnowledgeBaseDocument` 找到 `DocumentSource.id`。
- 再通过 `DocumentChunk.documentSourceId` 查询 chunks。
- 向量读取从 `DocumentChunk.embedding` 获取。
- 删除 `ChunkEmbedding` 的 upsert、freshness、contentHash 逻辑。
- 旧的 `chunkType` 概念统一改为 `type`，取值为 `faq | concept | procedure | note | summary`。
- 删除 `categoryIds` 过滤，改为 `categories` 文本过滤，匹配 `DocumentChunk.category`。
- 如果 `embedding` 为空，检索逻辑不直接写入向量；由解析/替换 chunk 后的向量化流程负责生成。开发期可保留临时 mock embedding 兜底，但不能再写入 `ChunkEmbedding`。

RAG scope 调整：

```ts
type RagRetrieveScope = {
  knowledgeBaseIds: string[];
  knowledgeIds?: string[]; // 指向 DocumentSource.id
  categories?: string[]; // 文本分类，匹配 DocumentChunk.category
  types?: Array<"faq" | "concept" | "procedure" | "note" | "summary">;
};
```

兼容要求：

- 旧请求中的 `categoryIds` 不再支持，API schema 应移除该字段。
- 旧请求中的 `chunkTypes` 应迁移为 `types`。
- 如果短期为了前端兼容仍接收 `chunkTypes`，服务端应归一化为 `types`，并返回弃用提示或内部日志。

### 5.3 文档上传解析服务

需要修改：

```txt
src/server/services/document.service.ts
src/app/api/documents/**
src/features/document/**
```

目标：

- 继续写入 `DocumentSource` / `DocumentChunk`。
- 解析生成 chunk 时补齐 `status`、`type` 默认值。
- 解析或替换 chunk 后立即生成并写入 `DocumentChunk.embedding`。
- chunk 内容变化时必须先清空 `embedding`，再等待重新生成；重新生成成功后写回 `DocumentChunk.embedding`。
- 不再需要把解析结果转换为 `KnowledgeDocument`。

### 5.4 数据分析服务

需要修改：

```txt
src/server/services/analytics.service.ts
src/app/api/analytics/**
```

目标：

- 文档统计基于 `DocumentSource`。
- chunk 统计基于 `DocumentChunk`。
- 热门知识和引用统计中的 `knowledgeId` 语义调整为 `DocumentSource.id`。
- `chunkId` 语义调整为 `DocumentChunk.id`。
- `UsageReference` 新增/使用 `type` 表示 chunk 类型，同时兼容保留旧 `chunkType` 字段一段时间。
- 写入引用时 `type` 和 `chunkType` 写同一个值，值域为 `faq | concept | procedure | note | summary`。
- 读取引用时优先使用 `type`，没有 `type` 时回退到 `chunkType`。

### 5.5 Agent 服务

需要修改：

```txt
src/server/services/agent/**
src/features/agent/**
```

目标：

- Agent 的知识库范围仍使用 `knowledgeBaseIds`。
- 校验可用 chunk 时通过 `KnowledgeBaseDocument` 找文档，再查 `DocumentChunk`。
- 引用返回中的 `documentId` / `knowledgeId` 指向 `DocumentSource.id`。
- 引用返回中的 `chunkId` 指向 `DocumentChunk.id`。

## 6. 前端类型与页面改造

需要修改：

```txt
src/features/knowledge-bases/types.ts
src/features/knowledge-bases/api.ts
src/features/knowledge-bases/index.tsx
src/features/knowledge-bases/components/knowledge-documents-dialog.tsx
src/features/knowledge-bases/components/document-chunks-dialog.tsx
src/store/slices/knowledge-base-slice.ts
```

目标：

- 前端可继续使用 `RagDoc`、`RagChunk` 作为 UI 类型，但后端数据来源改为 `DocumentSource` / `DocumentChunk`。
- 文档 ID 指向 `DocumentSource.id`。
- chunk ID 指向 `DocumentChunk.id`。
- chunk 展示增加 `category` 和 `type`。
- 检索筛选从 `categoryIds` 改为 `categories` 文本筛选。
- chunk 类型筛选从 `chunkTypes` 改为 `types`，值域为 `faq | concept | procedure | note | summary`。
- 知识库表单不再涉及 `chunkSize`、`chunkOverlap`。
- 如果候选知识页面删除，需要同步移除导航入口、store slice 和 API 调用。

## 7. 数据迁移策略

当前是 SQLite + Prisma，本次是破坏性模型收敛。建议按以下步骤执行：

1. 新 schema 增加目标字段和关系。
2. 将旧 `KnowledgeDocument` 数据迁移到 `DocumentSource`。
3. 将旧 `KnowledgeChunk` 数据迁移到 `DocumentChunk`。
4. 迁移时尽量保留旧 ID：旧 `KnowledgeDocument.id` 写入新 `DocumentSource.id`，旧 `KnowledgeChunk.id` 写入新 `DocumentChunk.id`。
5. 如果无法保留 ID，必须生成临时映射表或迁移脚本内映射：`oldKnowledgeDocumentId -> newDocumentSourceId`、`oldKnowledgeChunkId -> newDocumentChunkId`。
6. 将旧 `KnowledgeBaseDocument.documentId` 从 `KnowledgeDocument.id` 映射到迁移后的 `DocumentSource.id`。
7. 将旧 `KnowledgeChunk.embedding` 迁移到 `DocumentChunk.embedding`。
8. 将旧 RAG `chunkType` 值迁移到新 `DocumentChunk.type`。旧值映射建议：`qa -> faq`、`wiki -> concept`、`text -> note`、`summary -> summary`。
9. 将旧分类 ID 过滤相关数据不再作为 chunk 主字段迁移；如果已有可读分类名，可写入 `DocumentChunk.category`。
10. 迁移 `UsageReference`：`knowledgeId` 指向迁移后的 `DocumentSource.id`，`chunkId` 指向迁移后的 `DocumentChunk.id`，`type` 与兼容字段 `chunkType` 写同值。
11. 如果存在 `ChunkEmbedding` 且同一 chunk 没有内联 embedding，可将 `ChunkEmbedding.embedding` 补写到目标 `DocumentChunk.embedding`。
12. 删除旧表：`KnowledgeDocument`、`KnowledgeChunk`、`ChunkEmbedding`、`CandidateKnowledge`。
13. 重新生成 Prisma Client。

如果当前数据库没有必须保留的历史数据，可以采用更简单策略：

1. 修改 schema。
2. 删除本地 SQLite 数据库或清空相关表。
3. 执行 `npm run db:push`。
4. 重新导入测试数据。

最终采用哪种迁移方式取决于当前 `dev.db` 是否需要保留历史数据。

## 8. 校验规则

### 8.1 DocumentChunk type

Zod 层定义：

```ts
const documentChunkTypeSchema = z.enum([
  "faq",
  "concept",
  "procedure",
  "note",
  "summary",
]);
```

创建或替换 chunk 时：

- `type` 可选，默认 `note`。
- 如果传入，必须是五种类型之一。
- `category` 可选，空字符串应归一化为 `undefined` 或 `null`。
- `embedding` 可选，暂以字符串保存，不在 API 层强行解析为 number array。
- 创建或替换 chunk 时，如果 `content` 与原值不同，必须清空旧 `embedding` 并触发重新生成。
- 解析流程批量生成 chunks 时，应在写入 chunks 后立即生成 embedding 并回写。

### 8.2 RAG scope

Zod 层应删除旧字段：

```ts
categoryIds?: never;
chunkTypes?: never;
```

新字段：

```ts
categories?: string[];
types?: Array<"faq" | "concept" | "procedure" | "note" | "summary">;
```

校验规则：

- `categories` 是文本分类数组，空字符串应过滤。
- `types` 必须使用五种新类型。
- `knowledgeIds` 指向 `DocumentSource.id`。
- 如果短期兼容 `chunkTypes`，只能在 API 入参边界归一化为 `types`，服务层内部不得继续使用 `chunkTypes`。

### 8.3 KnowledgeBaseDocument

绑定文档时：

- `knowledgeBaseId` 必须存在于 `KnowledgeBase`。
- `documentId` 必须存在于 `DocumentSource`。
- 同一个知识库下不能重复绑定同一个文档。

### 8.4 删除行为

- 删除 `KnowledgeBase`：级联删除 `KnowledgeBaseDocument`，不删除 `DocumentSource`。
- 删除 `DocumentSource`：级联删除 `DocumentChunk` 和 `KnowledgeBaseDocument`。
- 删除 `DocumentChunk`：只删除该分片。

## 9. 验证要求

至少执行：

```bash
npm run db:generate
npm run build
```

如果修改了数据库并需要同步本地 SQLite：

```bash
npm run db:push
```

手动验证流程：

1. 打开知识库主页，列表能正常加载。
2. 新建知识库。
3. 上传或创建文档，文档写入 `DocumentSource`。
4. 文档绑定到知识库后，知识库详情能看到该文档。
5. 查看文档分片，分片来自 `DocumentChunk`。
6. chunk 可以展示 `category`、`type`、`embedding` 是否存在。
7. RAG 检索能通过知识库范围命中 `DocumentChunk`。
8. Agent 问答引用中的文档和分片 ID 使用新模型 ID。

## 10. 风险与取舍

### 10.1 删除 ChunkEmbedding 的取舍

好处：

- 模型更简单。
- 一条 chunk 对应一份 embedding，读取路径直接。
- 减少向量表和 chunk 表之间的同步问题。

代价：

- 不方便保存同一 chunk 的多模型 embedding。
- 不再通过 `contentHash` 判断 embedding 是否过期。
- 如果后续接入多个向量模型，可能需要重新引入独立 embedding 表。

当前业务接受该取舍。

### 10.2 删除 CandidateKnowledge 的取舍

好处：

- 减少候选知识与正式知识之间的转换链路。
- AI 总结结果直接落到 chunk 的 `category` 和 `type`。

代价：

- 不再支持独立的候选知识审核表。
- 如果后续需要“AI 草稿 -> 审核 -> 入库”流程，需要重新设计草稿表或审核状态字段。

当前业务接受该取舍。

### 10.3 使用 String 而不是 Prisma enum

保持当前项目风格，所有状态与类型字段继续使用 `String`。强约束放在 Zod/API 层，避免引入 enum 迁移复杂度。

## 11. 非目标

本次不做：

- 新增复杂审核工作流。
- 新增多 embedding 模型版本管理。
- 新增分类外键体系。
- 新增标签与 chunk/document 的多对多关系。
- 新增向量数据库。

这些能力可以在数据结构收敛稳定后单独设计。

## 12. 实施顺序建议

1. 修改 Prisma schema。
2. 更新 `docs/DataType.md`。
3. 更新 RAG 管理 server schemas/mappers/services。
4. 更新 API Route。
5. 更新前端 knowledge-bases 类型和组件。
6. 更新文档上传解析服务。
7. 更新 RAG 检索服务。
8. 更新 Agent 和 analytics 服务。
9. 删除 CandidateKnowledge 相关代码。
10. 执行 Prisma 生成、构建和手动冒烟验证。
