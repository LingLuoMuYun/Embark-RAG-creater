# 数据结构说明

本文档按当前 `prisma/schema.prisma` 描述数据库模型。当前数据结构已经并拢为一套文档/分片主模型：

- 文档主表：`DocumentSource`
- 分片主表：`DocumentChunk`
- 知识库与文档关系：`KnowledgeBaseDocument`
- 分片向量：直接存储在 `DocumentChunk.embedding`

以下旧模型已经删除，不再作为数据库表使用：

- `KnowledgeDocument`
- `KnowledgeChunk`
- `ChunkEmbedding`
- `CandidateKnowledge`

## 关系概览

```text
KnowledgeBase 1 - n KnowledgeBaseDocument
DocumentSource 1 - n KnowledgeBaseDocument
DocumentSource 1 - n DocumentChunk
ExpertAgent 1 - n AgentConversation
AgentConversation 1 - n AgentMessage
UsageLog 1 - n UsageReference
```

`KnowledgeBase.documents`、`DocumentSource.chunks`、`DocumentSource.knowledgeBases` 等是 Prisma 关系字段，不是数据库中的数组列。

## KnowledgeBase

知识库表，存储 RAG 知识库的基本配置。

| 字段                  | 说明                                                    |
| --------------------- | ------------------------------------------------------- |
| `id`                  | 主键。                                                  |
| `name`                | 知识库名称，唯一。                                      |
| `description`         | 描述。                                                  |
| `icon`                | 图标名，默认 `Database`。                               |
| `color`               | 颜色，默认 `blue`。                                     |
| `similarityThreshold` | 相似度阈值，默认 `0.7`。                                |
| `topK`                | 默认召回数量，默认 `5`。                                |
| `status`              | 状态，默认 `active`。                                   |
| `documents`           | Prisma 关系字段，访问关联的 `KnowledgeBaseDocument[]`。 |

`chunkSize` 和 `chunkOverlap` 已从知识库表删除。切片参数后续应作为上传/解析参数或文档级处理配置，不再放在知识库级别。

## KnowledgeBaseDocument

知识库与文档的多对多关联表。

| 字段              | 说明                                         |
| ----------------- | -------------------------------------------- |
| `id`              | 主键。                                       |
| `knowledgeBaseId` | 外键，指向 `KnowledgeBase.id`。              |
| `documentId`      | 外键，指向 `DocumentSource.id`。             |
| `status`          | 关联状态，默认 `active`。                    |
| `sortOrder`       | 排序值。                                     |
| `knowledgeBase`   | Prisma 关系对象。                            |
| `document`        | Prisma 关系对象，当前指向 `DocumentSource`。 |

`knowledgeBaseId` 不能删除，它负责表达“哪个知识库绑定了哪个文档”。

## DocumentSource

统一文档主表，承担原 `KnowledgeDocument` 和上传模块 `DocumentSource` 的业务角色。

| 字段             | 说明                                      |
| ---------------- | ----------------------------------------- |
| `id`             | 主键。迁移时尽量保留旧文档 ID。           |
| `title`          | 文档标题。                                |
| `sourceType`     | 来源类型，默认 `manual`。                 |
| `originalName`   | 原始文件名。                              |
| `fileType`       | 文件扩展或类型。                          |
| `fileName`       | 存储文件名。                              |
| `fileUrl`        | 文件 URL。                                |
| `mimeType`       | MIME 类型。                               |
| `fileSize`       | 文件大小。                                |
| `status`         | 文档状态，默认 `uploading`。              |
| `content`        | 解析后的正文。                            |
| `rawContent`     | 原始正文。                                |
| `parseStatus`    | 解析状态，默认 `pending`。                |
| `errorMessage`   | 解析或处理错误。                          |
| `chunkCount`     | 当前分片数量。                            |
| `chunks`         | Prisma 关系字段，访问 `DocumentChunk[]`。 |
| `knowledgeBases` | Prisma 关系字段，访问绑定到哪些知识库。   |

## DocumentChunk

统一分片表，承担原 `KnowledgeChunk` 和上传模块 `DocumentChunk` 的业务角色。

| 字段               | 说明                                      |
| ------------------ | ----------------------------------------- | ------- | --------- | ---- | ---------- |
| `id`               | 主键。迁移时尽量保留旧 chunk ID。         |
| `documentSourceId` | 外键，指向 `DocumentSource.id`。          |
| `chunkIndex`       | 文档内分片序号。                          |
| `content`          | 分片正文。                                |
| `charStart`        | 分片起始字符位置。                        |
| `charEnd`          | 分片结束字符位置。                        |
| `embedding`        | 分片向量，JSON 字符串形式存储。           |
| `category`         | AI 总结或人工维护的文本分类，默认未定义。 |
| `type`             | 分片类型，默认 `note`。可取 `faq          | concept | procedure | note | summary`。 |
| `status`           | 分片状态，默认 `active`。                 |
| `documentSource`   | Prisma 关系对象。                         |

`ChunkEmbedding` 已删除。当前默认一条 `DocumentChunk` 对应一份内联 `embedding`。解析或替换 chunk 后应生成并写入 `DocumentChunk.embedding`；内容变化时先清空 embedding，等待重新生成。

## KnowledgeCategory

全局分类主数据。

| 字段          | 说明             |
| ------------- | ---------------- |
| `id`          | 主键。           |
| `name`        | 分类名称，唯一。 |
| `description` | 描述。           |
| `color`       | 颜色。           |
| `sortOrder`   | 排序值。         |

## KnowledgeTag

全局标签主数据。

| 字段        | 说明             |
| ----------- | ---------------- |
| `id`        | 主键。           |
| `name`      | 标签名称，唯一。 |
| `color`     | 颜色。           |
| `sortOrder` | 排序值。         |

## ExpertAgent

专家 Agent 配置表。

| 字段                    | 说明                            |
| ----------------------- | ------------------------------- |
| `id`                    | 主键。                          |
| `name`                  | Agent 名称。                    |
| `description`           | 描述。                          |
| `answerStyle`           | 回答风格，默认 `strict`。       |
| `knowledgeScope`        | JSON 字符串形式的知识范围配置。 |
| `showReferences`        | 是否展示引用。                  |
| `allowKnowledgeCapture` | 是否允许提示知识沉淀。          |
| `status`                | 状态，默认 `draft`。            |
| `systemPrompt`          | 系统提示词。                    |

## AgentConversation

Agent 会话表。

| 字段                    | 说明                          |
| ----------------------- | ----------------------------- |
| `id`                    | 主键。                        |
| `agentId`               | 外键，指向 `ExpertAgent.id`。 |
| `title`                 | 会话标题。                    |
| `memorySummary`         | 长期记忆摘要。                |
| `memoryCursorMessageId` | 已压缩到记忆的消息游标。      |
| `memoryFailureCount`    | 记忆压缩失败次数。            |
| `status`                | 会话状态。                    |

## AgentMessage

Agent 消息表。

| 字段             | 说明                                |
| ---------------- | ----------------------------------- |
| `id`             | 主键。                              |
| `conversationId` | 外键，指向 `AgentConversation.id`。 |
| `role`           | 消息角色。                          |
| `content`        | 消息内容。                          |
| `citationsJson`  | 引用 JSON。                         |

## UsageLog

RAG 使用日志表。

| 字段         | 说明                                       |
| ------------ | ------------------------------------------ |
| `id`         | 主键。                                     |
| `source`     | 来源，默认 `rag_retrieve`。                |
| `query`      | 用户问题。                                 |
| `mode`       | 检索模式。                                 |
| `scope`      | 检索范围 JSON。                            |
| `hitCount`   | 命中引用数。                               |
| `noHit`      | 是否无命中。                               |
| `references` | Prisma 关系字段，访问 `UsageReference[]`。 |

## UsageReference

RAG 命中引用表。

| 字段              | 说明                                         |
| ----------------- | -------------------------------------------- |
| `id`              | 主键。                                       |
| `usageLogId`      | 外键，指向 `UsageLog.id`。                   |
| `knowledgeBaseId` | 命中的知识库 ID。                            |
| `knowledgeId`     | 当前语义为 `DocumentSource.id`。             |
| `chunkId`         | 当前语义为 `DocumentChunk.id`。              |
| `title`           | 引用标题。                                   |
| `type`            | 新 chunk 类型字段。                          |
| `chunkType`       | 旧兼容字段，短期保留；写入时与 `type` 同值。 |

读取引用时优先使用 `type`，兼容期内可回退到 `chunkType`。
