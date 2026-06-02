type KnowledgeBaseListRecord = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  similarityThreshold: number;
  topK: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  documents: {
    document: {
      chunks: { id: string }[];
    };
  }[];
};

type DocumentChunkRecord = {
  id: string;
  documentSourceId: string;
  content: string;
  chunkIndex: number;
  embedding: string | null;
  category: string | null;
  type: string;
  status: string;
  charStart: number | null;
  charEnd: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type DocumentSourceRecord = {
  id: string;
  title: string;
  sourceType: string;
  originalName: string | null;
  fileType: string | null;
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  content: string | null;
  rawContent: string | null;
  parseStatus: string;
  status: string;
  errorMessage: string | null;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
  chunks?: DocumentChunkRecord[];
  knowledgeBases?: {
    id: string;
    knowledgeBase: {
      id: string;
      name: string;
      status?: string;
    };
  }[];
};

export function mapKnowledgeChunk(chunk: DocumentChunkRecord) {
  return {
    id: chunk.id,
    documentId: chunk.documentSourceId,
    content: chunk.content,
    chunkIndex: chunk.chunkIndex,
    embedding: chunk.embedding,
    category: chunk.category,
    type: chunk.type,
    status: chunk.status,
    startIndex: chunk.charStart,
    endIndex: chunk.charEnd,
    createdAt: chunk.createdAt.toISOString(),
    updatedAt: chunk.updatedAt.toISOString(),
  };
}

export function mapKnowledgeBaseListItem(item: KnowledgeBaseListRecord) {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? "",
    icon: item.icon,
    color: item.color,
    similarityThreshold: item.similarityThreshold,
    topK: item.topK,
    status: item.status,
    documentCount: item.documents.length,
    chunkCount: item.documents.reduce(
      (sum, relation) => sum + relation.document.chunks.length,
      0
    ),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function mapKnowledgeDocumentListItem(document: DocumentSourceRecord) {
  return {
    id: document.id,
    title: document.title,
    name: document.title,
    sourceType: document.sourceType,
    originalName: document.originalName,
    fileType: document.fileType,
    fileName: document.fileName ?? document.originalName ?? "",
    fileUrl: document.fileUrl,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    size: document.fileSize ?? 0,
    content: document.content,
    rawContent: document.rawContent ?? document.content,
    parseStatus: document.parseStatus,
    status: document.status,
    error: document.errorMessage,
    errorMessage: document.errorMessage,
    chunkCount: document.chunks?.length ?? document.chunkCount ?? 0,
    knowledgeBaseCount: document.knowledgeBases?.length ?? 0,
    knowledgeBases:
      document.knowledgeBases?.map((relation) => ({
        relationId: relation.id,
        id: relation.knowledgeBase.id,
        name: relation.knowledgeBase.name,
        status: relation.knowledgeBase.status ?? "active",
      })) ?? [],
    uploadedAt: document.createdAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function mapKnowledgeDocumentDetail(document: DocumentSourceRecord) {
  return {
    ...mapKnowledgeDocumentListItem(document),
    chunks: (document.chunks ?? []).map(mapKnowledgeChunk),
  };
}

type KnowledgeBaseTreeRecord = Omit<KnowledgeBaseListRecord, "documents"> & {
  documents: {
    id: string;
    status: string;
    sortOrder: number;
    document: DocumentSourceRecord & {
      chunks: DocumentChunkRecord[];
    };
  }[];
};

export function mapKnowledgeBaseTree(item: KnowledgeBaseTreeRecord) {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? "",
    icon: item.icon,
    color: item.color,
    similarityThreshold: item.similarityThreshold,
    topK: item.topK,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    documents: item.documents.map((relation) => ({
      relationId: relation.id,
      relationStatus: relation.status,
      sortOrder: relation.sortOrder,
      ...mapKnowledgeDocumentDetail(relation.document),
    })),
  };
}
