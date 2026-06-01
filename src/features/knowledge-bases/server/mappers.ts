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

type KnowledgeChunkRecord = {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  embedding: string | null;
  status: string;
  startIndex: number | null;
  endIndex: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type KnowledgeDocumentRecord = {
  id: string;
  title: string;
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
  chunks?: KnowledgeChunkRecord[];
  knowledgeBases?: {
    id: string;
    knowledgeBase: {
      id: string;
      name: string;
      status: string;
    };
  }[];
};

export function mapKnowledgeChunk(chunk: KnowledgeChunkRecord) {
  return {
    id: chunk.id,
    documentId: chunk.documentId,
    content: chunk.content,
    chunkIndex: chunk.chunkIndex,
    embedding: chunk.embedding,
    status: chunk.status,
    startIndex: chunk.startIndex,
    endIndex: chunk.endIndex,
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

export function mapKnowledgeDocumentListItem(document: KnowledgeDocumentRecord) {
  return {
    id: document.id,
    title: document.title,
    name: document.title,
    sourceType: document.sourceType,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    size: document.fileSize ?? 0,
    rawContent: document.rawContent,
    chunkSize: document.chunkSize,
    chunkOverlap: document.chunkOverlap,
    parseStatus: document.parseStatus,
    status: document.status,
    error: document.error,
    chunkCount: document.chunks?.length ?? 0,
    knowledgeBaseCount: document.knowledgeBases?.length ?? 0,
    uploadedAt: document.createdAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function mapKnowledgeDocumentDetail(document: KnowledgeDocumentRecord) {
  return {
    id: document.id,
    title: document.title,
    name: document.title,
    sourceType: document.sourceType,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    size: document.fileSize ?? 0,
    rawContent: document.rawContent,
    chunkSize: document.chunkSize,
    chunkOverlap: document.chunkOverlap,
    parseStatus: document.parseStatus,
    status: document.status,
    error: document.error,
    uploadedAt: document.createdAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    chunks: (document.chunks ?? []).map(mapKnowledgeChunk),
    knowledgeBases: (document.knowledgeBases ?? []).map((relation) => ({
      relationId: relation.id,
      id: relation.knowledgeBase.id,
      name: relation.knowledgeBase.name,
      status: relation.knowledgeBase.status,
    })),
  };
}

type KnowledgeBaseTreeRecord = Omit<KnowledgeBaseListRecord, "documents"> & {
  documents: {
    id: string;
    status: string;
    sortOrder: number;
    document: KnowledgeDocumentRecord & {
      chunks: KnowledgeChunkRecord[];
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
