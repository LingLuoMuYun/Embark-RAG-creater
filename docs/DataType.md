# 数据库数据结构说明

本文档根据 [prisma/schema.prisma](../prisma/schema.prisma) 维护，说明当前 SQLite/Prisma 数据模型、字段含义、关系约定、索引以及仍处于兼容期或尚未完全关联的字段。

## 总览

当前 schema 没有使用 Prisma enum，业务状态字段均为 `String`。下文列出的状态值是当前业务约定，不是数据库强约束。

`createdAt` 表示创建时间，`updatedAt` 表示更新时间。带 `@updatedAt` 的字段由 Prisma 自动维护。

核心模型：

```txt
KnowledgeBase
KnowledgeDocument
KnowledgeBaseDocument
KnowledgeChunk
ChunkEmbedding
KnowledgeCategory
KnowledgeTag
DocumentSource
DocumentChunk
CandidateKnowledge
ExpertAgent
AgentConversation
AgentMessage
UsageLog
UsageReference
```

主要关系：

```txt
KnowledgeBase n - n KnowledgeDocument
  通过 KnowledgeBaseDocument 实现

KnowledgeDocument 1 - n KnowledgeChunk
DocumentSource 1 - n DocumentChunk
ExpertAgent 1 - n AgentConversation
AgentConversation 1 - n AgentMessage
UsageLog 1 - n UsageReference
```

需要特别注意：

- `KnowledgeBase.documents`、`KnowledgeDocument.knowledgeBases`、`KnowledgeBaseDocument.knowledgeBase`、`KnowledgeBaseDocument.document` 等是 Prisma 关系字段，不是数据库中的数组列或对象列。
- `KnowledgeBaseDocument` 是当前知识库与知识文档的主关联表。
- `KnowledgeDocument.knowledgeBaseId`、`KnowledgeChunk.knowledgeBaseId` 是兼容旧逻辑的单知识库字段，不能表达多知识库复用。
- `ChunkEmbedding.chunkId` 当前只是字符串主键，schema 没有声明它指向 `KnowledgeChunk.id` 或 `DocumentChunk.id` 的外键关系。
- `DocumentSource` / `DocumentChunk` 与 `KnowledgeDocument` / `KnowledgeChunk` 是两套不同模块产生的结构，目前 schema 中没有直接外键或转换关系。

## KnowledgeBase 知识库表

存储 RAG 知识库的基础信息、展示信息、检索参数和启用状态。

```ts
type KnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  chunkSize: number;
  chunkOverlap: number;
  similarityThreshold: number;
  topK: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  documents: KnowledgeBaseDocument[];
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `name` | 知识库名称，唯一。 |
| `description` | 知识库描述，可为空。 |
| `icon` | 图标名称，默认 `Database`。 |
| `color` | 颜色标识，默认 `blue`。 |
| `chunkSize` | 兼容字段。旧设计中知识库级切片大小；新 RAG 管理更倾向使用 `KnowledgeDocument.chunkSize`。 |
| `chunkOverlap` | 兼容字段。旧设计中知识库级切片重叠长度；新 RAG 管理更倾向使用 `KnowledgeDocument.chunkOverlap`。 |
| `similarityThreshold` | 检索相似度阈值，默认 `0.7`。 |
| `topK` | 检索返回数量上限，默认 `5`。 |
| `status` | 知识库状态，默认 `active`。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |
| `documents` | Prisma 关系字段，访问该知识库下的 `KnowledgeBaseDocument[]` 关联记录。 |

索引：

```prisma
@@index([status])
```

## KnowledgeDocument 知识文档表

存储 RAG 知识库管理侧的知识文档。文档可以通过 `KnowledgeBaseDocument` 绑定到多个知识库。

```ts
type KnowledgeDocument = {
  id: string;
  title: string;
  knowledgeBaseId: string | null;
  sourceType: string;
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  rawContent: string | null;
  chunkSize: number;
  chunkOverlap: number;
  parseStatus: string;
  status: string;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  knowledgeBases: KnowledgeBaseDocument[];
  chunks: KnowledgeChunk[];
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `title` | 文档标题。 |
| `knowledgeBaseId` | 兼容字段。旧代码用于表示单一所属知识库；主关系应使用 `KnowledgeBaseDocument`。 |
| `sourceType` | 来源类型，默认 `manual`。 |
| `fileName` | 原始文件名，可为空。 |
| `fileUrl` | 文件访问地址或导入来源地址，可为空。 |
| `mimeType` | 文件 MIME 类型，可为空。 |
| `fileSize` | 文件大小，单位字节，可为空。 |
| `rawContent` | 解析或录入得到的原始文本内容，可为空。 |
| `chunkSize` | 该文档的切片大小，默认 `800`。 |
| `chunkOverlap` | 该文档的切片重叠长度，默认 `100`。 |
| `parseStatus` | 解析状态，默认 `pending`。 |
| `status` | 文档业务状态，默认 `active`。 |
| `error` | 解析、入库或处理失败时的错误信息。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |
| `knowledgeBases` | Prisma 关系字段，访问该文档绑定的 `KnowledgeBaseDocument[]` 关联记录。 |
| `chunks` | Prisma 关系字段，访问该文档下的 `KnowledgeChunk[]`。 |

索引：

```prisma
@@index([knowledgeBaseId])
@@index([sourceType])
@@index([parseStatus])
@@index([status])
```

## KnowledgeBaseDocument 知识库-文档关联表

存储知识库与知识文档之间的多对多关系。它不是纯连接表，还保存关系状态、排序和时间信息。

```ts
type KnowledgeBaseDocument = {
  id: string;
  knowledgeBaseId: string;
  documentId: string;
  status: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  knowledgeBase: KnowledgeBase;
  document: KnowledgeDocument;
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `knowledgeBaseId` | 真实外键字段，对应 `KnowledgeBase.id`。 |
| `documentId` | 真实外键字段，对应 `KnowledgeDocument.id`。 |
| `status` | 该文档在该知识库下的关联状态，默认 `active`。 |
| `sortOrder` | 文档在知识库内的排序值，默认 `0`。 |
| `createdAt` | 绑定关系创建时间。 |
| `updatedAt` | 绑定关系更新时间。 |
| `knowledgeBase` | Prisma 关系对象，通过 `knowledgeBaseId -> KnowledgeBase.id` 解析。知识库删除时级联删除关系。 |
| `document` | Prisma 关系对象，通过 `documentId -> KnowledgeDocument.id` 解析。文档删除时级联删除关系。 |

约束和索引：

```prisma
@@unique([knowledgeBaseId, documentId])
@@index([knowledgeBaseId])
@@index([documentId])
@@index([status])
```

## KnowledgeChunk 知识分片表

存储 `KnowledgeDocument` 下的知识分片。当前 schema 中分片直接属于文档；知识库范围应通过 `KnowledgeBaseDocument` 找到文档后再找分片。

```ts
type KnowledgeChunk = {
  id: string;
  documentId: string;
  knowledgeBaseId: string | null;
  content: string;
  chunkIndex: number;
  embedding: string | null;
  status: string;
  startIndex: number | null;
  endIndex: number | null;
  createdAt: Date;
  updatedAt: Date;
  document: KnowledgeDocument;
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `documentId` | 真实外键字段，对应 `KnowledgeDocument.id`。 |
| `knowledgeBaseId` | 兼容字段。旧 RAG/Agent 逻辑用于按知识库过滤 chunk。 |
| `content` | 分片正文。 |
| `chunkIndex` | 分片在文档中的顺序。 |
| `embedding` | 兼容/旧向量字段。当前更适合向 `ChunkEmbedding` 收敛，但 schema 仍保留该字段。 |
| `status` | 分片状态，默认 `active`。 |
| `startIndex` | 分片在原始文本中的起始字符位置。 |
| `endIndex` | 分片在原始文本中的结束字符位置。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |
| `document` | Prisma 关系对象，通过 `documentId -> KnowledgeDocument.id` 解析。文档删除时级联删除分片。 |

索引：

```prisma
@@index([knowledgeBaseId])
@@index([documentId])
@@index([status])
@@index([knowledgeBaseId, status])
@@index([documentId, status])
```

## ChunkEmbedding 分片向量表

存储 chunk 的向量、向量模型和内容 hash。当前 schema 未声明外键关系，因此 `chunkId` 只是字符串主键；从现有 RAG 代码看，它更偏向作为 `KnowledgeChunk` 的向量索引。

```ts
type ChunkEmbedding = {
  chunkId: string;
  embedding: string;
  embeddingModel: string;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
};
```

| 字段 | 作用 |
| --- | --- |
| `chunkId` | 主键。语义上表示对应 chunk 的 ID，但当前 schema 没有外键约束。 |
| `embedding` | 向量数据，通常是 JSON 或其他字符串序列化格式。 |
| `embeddingModel` | 生成该向量使用的模型名称。 |
| `contentHash` | chunk 内容 hash，用于判断内容变化后是否需要重建向量。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |

索引：

```prisma
@@index([embeddingModel])
@@index([contentHash])
@@index([updatedAt])
```

## KnowledgeCategory 知识分类表

存储全局知识分类主数据。当前 schema 中没有和 `KnowledgeDocument` 或知识条目建立外键关系。

```ts
type KnowledgeCategory = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `name` | 分类名称，唯一。 |
| `description` | 分类描述，可为空。 |
| `color` | 分类颜色，可为空。 |
| `sortOrder` | 排序值，默认 `0`。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |

索引：

```prisma
@@index([sortOrder])
@@index([createdAt])
```

## KnowledgeTag 知识标签表

存储全局知识标签主数据。当前 schema 中没有和 `KnowledgeDocument` 或知识条目建立外键关系。

```ts
type KnowledgeTag = {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `name` | 标签名称，唯一。 |
| `color` | 标签颜色，可为空。 |
| `sortOrder` | 排序值，默认 `0`。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |

索引：

```prisma
@@index([sortOrder])
@@index([createdAt])
```

## DocumentSource 文档来源表

存储文档上传/解析模块的来源记录。它和 `KnowledgeDocument` 是不同模块的数据结构，当前 schema 中没有直接外键关系。

```ts
type DocumentSource = {
  id: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  status: string;
  content: string | null;
  errorMessage: string | null;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
  chunks: DocumentChunk[];
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `originalName` | 上传或导入文件的原始名称。 |
| `fileType` | 文件类型或扩展名。 |
| `fileSize` | 文件大小，单位字节。 |
| `status` | 上传/解析状态，默认 `uploading`。 |
| `content` | 解析出的全文内容，可为空。 |
| `errorMessage` | 解析失败时的错误信息。 |
| `chunkCount` | 解析后生成的 `DocumentChunk` 数量，默认 `0`。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |
| `chunks` | Prisma 关系字段，访问该来源下的 `DocumentChunk[]`。 |

索引：

```prisma
@@index([status])
```

## DocumentChunk 文档分块表

存储 `DocumentSource` 下的文本分块。当前 schema 中它没有向量字段，也没有和 `ChunkEmbedding` 建立关系。

```ts
type DocumentChunk = {
  id: string;
  documentSourceId: string;
  chunkIndex: number;
  content: string;
  charStart: number;
  charEnd: number;
  createdAt: Date;
  updatedAt: Date;
  documentSource: DocumentSource;
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `documentSourceId` | 真实外键字段，对应 `DocumentSource.id`。 |
| `chunkIndex` | 分块顺序。 |
| `content` | 分块文本内容。 |
| `charStart` | 分块在来源全文中的起始字符位置。 |
| `charEnd` | 分块在来源全文中的结束字符位置。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |
| `documentSource` | Prisma 关系对象，通过 `documentSourceId -> DocumentSource.id` 解析。来源删除时级联删除分块。 |

索引：

```prisma
@@index([documentSourceId])
@@index([documentSourceId, chunkIndex])
```

## CandidateKnowledge 候选知识表

存储 AI 提炼出的候选知识。当前仅通过 `documentSourceId` 字符串记录可能的来源文档 ID，schema 中没有声明 `DocumentSource` 外键关系。

```ts
type CandidateKnowledge = {
  id: string;
  documentSourceId: string | null;
  title: string;
  content: string;
  suggestedCategory: string | null;
  suggestedTags: string | null;
  type: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `documentSourceId` | 来源文档 ID，可为空；当前不是外键关系。 |
| `title` | AI 提炼的知识标题。 |
| `content` | AI 提炼的知识正文。 |
| `suggestedCategory` | AI 建议的分类名称，纯文本，可为空。 |
| `suggestedTags` | AI 建议的标签列表，通常为 JSON 数组字符串，可为空。 |
| `type` | 候选知识类型，默认 `concept`。注释约定值包括 `faq`、`concept`、`procedure`、`note`、`summary`。 |
| `status` | 审核状态，默认 `pending`。注释约定值包括 `pending`、`confirmed`、`rejected`。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |

索引：

```prisma
@@index([status])
@@index([documentSourceId])
```

## ExpertAgent 专家 Agent 表

存储可被问答模块消费的专家 Agent 配置。

```ts
type ExpertAgent = {
  id: string;
  name: string;
  description: string | null;
  answerStyle: string;
  knowledgeScope: string;
  showReferences: boolean;
  allowKnowledgeCapture: boolean;
  status: string;
  systemPrompt: string | null;
  createdAt: Date;
  updatedAt: Date;
  conversations: AgentConversation[];
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `name` | Agent 名称。 |
| `description` | Agent 描述，可为空。 |
| `answerStyle` | 回答风格，默认 `strict`。 |
| `knowledgeScope` | JSON 字符串，保存 Agent 允许检索的知识范围，默认 `{}`。 |
| `showReferences` | 是否展示引用来源，默认 `true`。 |
| `allowKnowledgeCapture` | 是否允许从对话中沉淀新知识，默认 `false`。 |
| `status` | Agent 状态，默认 `draft`。 |
| `systemPrompt` | 系统提示词，可为空。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |
| `conversations` | Prisma 关系字段，访问该 Agent 下的会话。 |

索引：

```prisma
@@index([status])
@@index([answerStyle])
@@index([createdAt])
```

## AgentConversation Agent 会话表

存储某个 Agent 的一次对话会话。

```ts
type AgentConversation = {
  id: string;
  agentId: string;
  title: string;
  memorySummary: string | null;
  memoryCursorMessageId: string | null;
  memoryFailureCount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  agent: ExpertAgent;
  messages: AgentMessage[];
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `agentId` | 真实外键字段，对应 `ExpertAgent.id`。 |
| `title` | 会话标题。 |
| `memorySummary` | 会话长期记忆摘要，可为空。 |
| `memoryCursorMessageId` | 记忆摘要处理到的消息游标，可为空。 |
| `memoryFailureCount` | 记忆更新失败次数，默认 `0`。 |
| `status` | 会话状态，默认 `active`。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |
| `agent` | Prisma 关系对象，通过 `agentId -> ExpertAgent.id` 解析。Agent 删除时级联删除会话。 |
| `messages` | Prisma 关系字段，访问会话下的消息列表。 |

索引：

```prisma
@@index([agentId])
@@index([status])
@@index([updatedAt])
```

## AgentMessage Agent 消息表

存储 Agent 会话中的单条消息。

```ts
type AgentMessage = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  citationsJson: string | null;
  createdAt: Date;
  conversation: AgentConversation;
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `conversationId` | 真实外键字段，对应 `AgentConversation.id`。 |
| `role` | 消息角色。当前常见值包括 `user`、`assistant`、`system`。 |
| `content` | 消息正文。 |
| `citationsJson` | 引用来源 JSON 字符串，可为空。 |
| `createdAt` | 创建时间。 |
| `conversation` | Prisma 关系对象，通过 `conversationId -> AgentConversation.id` 解析。会话删除时级联删除消息。 |

索引：

```prisma
@@index([conversationId])
@@index([createdAt])
```

## UsageLog 使用日志表

存储一次知识检索或问答消费事件，用于数据分析、热门知识和知识缺口统计。

```ts
type UsageLog = {
  id: string;
  source: string;
  query: string;
  mode: string;
  scope: string;
  hitCount: number;
  noHit: boolean;
  createdAt: Date;
  updatedAt: Date;
  references: UsageReference[];
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `source` | 日志来源，默认 `rag_retrieve`。 |
| `query` | 用户查询文本。 |
| `mode` | 检索模式，默认 `balanced`。 |
| `scope` | JSON 字符串，保存本次检索使用的范围配置。 |
| `hitCount` | 本次命中的引用数量，默认 `0`。 |
| `noHit` | 是否未命中任何知识，默认 `false`。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |
| `references` | Prisma 关系字段，访问本次日志关联的引用来源。 |

索引：

```prisma
@@index([source])
@@index([noHit])
@@index([query])
@@index([createdAt])
```

## UsageReference 使用引用表

存储一次使用日志命中的知识来源，用于热门知识统计和引用追踪。

```ts
type UsageReference = {
  id: string;
  usageLogId: string;
  knowledgeBaseId: string;
  knowledgeId: string;
  chunkId: string;
  title: string;
  chunkType: string;
  createdAt: Date;
  updatedAt: Date;
  usageLog: UsageLog;
};
```

| 字段 | 作用 |
| --- | --- |
| `id` | 主键，使用 `cuid()` 自动生成。 |
| `usageLogId` | 真实外键字段，对应 `UsageLog.id`。 |
| `knowledgeBaseId` | 命中的知识库 ID。 |
| `knowledgeId` | 命中的知识或文档 ID。当前通常对应 `KnowledgeDocument.id`。 |
| `chunkId` | 命中的 chunk ID。当前通常对应 `KnowledgeChunk.id`。 |
| `title` | 命中知识标题，用于统计展示时避免额外 join。 |
| `chunkType` | chunk 类型。当前 schema 没有强约束。 |
| `createdAt` | 创建时间。 |
| `updatedAt` | 更新时间。 |
| `usageLog` | Prisma 关系对象，通过 `usageLogId -> UsageLog.id` 解析。日志删除时级联删除引用。 |

索引：

```prisma
@@index([usageLogId])
@@index([knowledgeBaseId])
@@index([knowledgeId])
@@index([chunkId])
@@index([chunkType])
```

## 当前需要收敛或确认的点

### 多对多主关系与兼容字段

`KnowledgeBaseDocument` 已经能够表达知识库和文档的多对多关系。`KnowledgeDocument.knowledgeBaseId` 和 `KnowledgeChunk.knowledgeBaseId` 只能表达单知识库归属，属于兼容旧检索、统计或 Agent 逻辑的字段。后续如果所有调用都改为通过 `KnowledgeBaseDocument` 解析知识库范围，可以再考虑迁移并删除这些兼容字段。

### 向量字段归属

`KnowledgeChunk.embedding` 和 `ChunkEmbedding.embedding` 在功能上有重叠。`ChunkEmbedding` 额外保存 `embeddingModel` 和 `contentHash`，更适合做向量索引管理。但当前 schema 没有声明 `ChunkEmbedding.chunkId` 的外键，因此需要后续明确它到底归属于 `KnowledgeChunk` 还是 `DocumentChunk`。结合现有 RAG 代码，更自然的方向是关联到 `KnowledgeChunk`。

### 文档解析模型与 RAG 知识模型

`DocumentSource` / `DocumentChunk` 与 `KnowledgeDocument` / `KnowledgeChunk` 是不同模块开发出的两套结构，概念有重叠，但当前 schema 没有直接关系。不要默认它们已经形成完整流水线。后续需要根据业务决定是保留两套模型、建立转换关系，还是迁移到统一模型。

### CandidateKnowledge 的来源关系

`CandidateKnowledge.documentSourceId` 当前只是字符串字段，没有声明外键。它可以记录候选知识来源，但数据库不会保证该 ID 一定存在于 `DocumentSource`。
