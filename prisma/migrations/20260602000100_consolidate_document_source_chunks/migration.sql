PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "DocumentSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "originalName" TEXT,
    "fileType" TEXT,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'uploading',
    "content" TEXT,
    "rawContent" TEXT,
    "parseStatus" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "DocumentSource" (
    "id",
    "title",
    "sourceType",
    "originalName",
    "fileName",
    "fileUrl",
    "mimeType",
    "fileSize",
    "status",
    "content",
    "rawContent",
    "parseStatus",
    "errorMessage",
    "chunkCount",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "title",
    "sourceType",
    "fileName",
    "fileName",
    "fileUrl",
    "mimeType",
    "fileSize",
    "status",
    "rawContent",
    "rawContent",
    "parseStatus",
    "error",
    (
        SELECT COUNT(*)
        FROM "KnowledgeChunk"
        WHERE "KnowledgeChunk"."documentId" = "KnowledgeDocument"."id"
    ),
    "createdAt",
    "updatedAt"
FROM "KnowledgeDocument";

CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentSourceId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "charStart" INTEGER,
    "charEnd" INTEGER,
    "embedding" TEXT,
    "category" TEXT,
    "type" TEXT NOT NULL DEFAULT 'note',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentChunk_documentSourceId_fkey" FOREIGN KEY ("documentSourceId") REFERENCES "DocumentSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "DocumentChunk" (
    "id",
    "documentSourceId",
    "chunkIndex",
    "content",
    "charStart",
    "charEnd",
    "embedding",
    "category",
    "type",
    "status",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "documentId",
    "chunkIndex",
    "content",
    "startIndex",
    "endIndex",
    "embedding",
    NULL,
    'note',
    "status",
    "createdAt",
    "updatedAt"
FROM "KnowledgeChunk";

CREATE TABLE "new_KnowledgeBaseDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeBaseId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeBaseDocument_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeBaseDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_KnowledgeBaseDocument" (
    "id",
    "knowledgeBaseId",
    "documentId",
    "status",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "knowledgeBaseId",
    "documentId",
    "status",
    "sortOrder",
    "createdAt",
    "updatedAt"
FROM "KnowledgeBaseDocument";

DROP TABLE "KnowledgeBaseDocument";
ALTER TABLE "new_KnowledgeBaseDocument" RENAME TO "KnowledgeBaseDocument";

DROP TABLE "KnowledgeChunk";
DROP TABLE "KnowledgeDocument";

CREATE TABLE "KnowledgeCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "KnowledgeTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ExpertAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "answerStyle" TEXT NOT NULL DEFAULT 'strict',
    "knowledgeScope" TEXT NOT NULL DEFAULT '{}',
    "showReferences" BOOLEAN NOT NULL DEFAULT true,
    "allowKnowledgeCapture" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "systemPrompt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "AgentConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "memorySummary" TEXT,
    "memoryCursorMessageId" TEXT,
    "memoryFailureCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentConversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ExpertAgent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citationsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'rag_retrieve',
    "query" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'balanced',
    "scope" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "noHit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "UsageReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usageLogId" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "knowledgeId" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "chunkType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UsageReference_usageLogId_fkey" FOREIGN KEY ("usageLogId") REFERENCES "UsageLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DocumentSource_status_idx" ON "DocumentSource"("status");
CREATE INDEX "DocumentSource_sourceType_idx" ON "DocumentSource"("sourceType");
CREATE INDEX "DocumentSource_parseStatus_idx" ON "DocumentSource"("parseStatus");
CREATE INDEX "DocumentChunk_documentSourceId_idx" ON "DocumentChunk"("documentSourceId");
CREATE INDEX "DocumentChunk_documentSourceId_chunkIndex_idx" ON "DocumentChunk"("documentSourceId", "chunkIndex");
CREATE INDEX "DocumentChunk_status_idx" ON "DocumentChunk"("status");
CREATE INDEX "DocumentChunk_type_idx" ON "DocumentChunk"("type");
CREATE INDEX "DocumentChunk_category_idx" ON "DocumentChunk"("category");
CREATE INDEX "KnowledgeBaseDocument_knowledgeBaseId_idx" ON "KnowledgeBaseDocument"("knowledgeBaseId");
CREATE INDEX "KnowledgeBaseDocument_documentId_idx" ON "KnowledgeBaseDocument"("documentId");
CREATE INDEX "KnowledgeBaseDocument_status_idx" ON "KnowledgeBaseDocument"("status");
CREATE UNIQUE INDEX "KnowledgeBaseDocument_knowledgeBaseId_documentId_key" ON "KnowledgeBaseDocument"("knowledgeBaseId", "documentId");
CREATE UNIQUE INDEX "KnowledgeCategory_name_key" ON "KnowledgeCategory"("name");
CREATE INDEX "KnowledgeCategory_sortOrder_idx" ON "KnowledgeCategory"("sortOrder");
CREATE INDEX "KnowledgeCategory_createdAt_idx" ON "KnowledgeCategory"("createdAt");
CREATE UNIQUE INDEX "KnowledgeTag_name_key" ON "KnowledgeTag"("name");
CREATE INDEX "KnowledgeTag_sortOrder_idx" ON "KnowledgeTag"("sortOrder");
CREATE INDEX "KnowledgeTag_createdAt_idx" ON "KnowledgeTag"("createdAt");
CREATE INDEX "ExpertAgent_status_idx" ON "ExpertAgent"("status");
CREATE INDEX "ExpertAgent_answerStyle_idx" ON "ExpertAgent"("answerStyle");
CREATE INDEX "ExpertAgent_createdAt_idx" ON "ExpertAgent"("createdAt");
CREATE INDEX "AgentConversation_agentId_idx" ON "AgentConversation"("agentId");
CREATE INDEX "AgentConversation_status_idx" ON "AgentConversation"("status");
CREATE INDEX "AgentConversation_updatedAt_idx" ON "AgentConversation"("updatedAt");
CREATE INDEX "AgentMessage_conversationId_idx" ON "AgentMessage"("conversationId");
CREATE INDEX "AgentMessage_createdAt_idx" ON "AgentMessage"("createdAt");
CREATE INDEX "UsageLog_source_idx" ON "UsageLog"("source");
CREATE INDEX "UsageLog_noHit_idx" ON "UsageLog"("noHit");
CREATE INDEX "UsageLog_query_idx" ON "UsageLog"("query");
CREATE INDEX "UsageLog_createdAt_idx" ON "UsageLog"("createdAt");
CREATE INDEX "UsageReference_usageLogId_idx" ON "UsageReference"("usageLogId");
CREATE INDEX "UsageReference_knowledgeBaseId_idx" ON "UsageReference"("knowledgeBaseId");
CREATE INDEX "UsageReference_knowledgeId_idx" ON "UsageReference"("knowledgeId");
CREATE INDEX "UsageReference_chunkId_idx" ON "UsageReference"("chunkId");
CREATE INDEX "UsageReference_type_idx" ON "UsageReference"("type");
CREATE INDEX "UsageReference_chunkType_idx" ON "UsageReference"("chunkType");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
