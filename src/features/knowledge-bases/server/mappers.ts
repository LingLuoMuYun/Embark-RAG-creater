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
  documentSourceId: string | null;
  content: string;
  chunkIndex: number;
  embedding: string | null;
  chunkStatus: string;
  charStart: number;
  charEnd: number;
  chunkType: string;
  title: string | null;
  suggestedCategory: string | null;
  suggestedTags: string | null;
  knowledgeType: string | null;
  reviewStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DocumentSourceRecord = {
  id: string;
  title: string;
  originalName: string;
  fileType: string;
  sourceType: string;
  fileName: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number;
  rawContent: string | null;
  chunkSize: number;
  chunkOverlap: number;
  status: string;
  activeStatus: string;
  error: string | null;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
  chunks?: DocumentChunkRecord[];
  knowledgeBases?: {
    id: string;
    knowledgeBase: {
      id: string;
      name: string;
      status: string;
    };
  }[];
};

export function mapDocumentChunk(chunk: DocumentChunkRecord) {
  return {
    id: chunk.id,
    documentId: chunk.documentSourceId,
    content: chunk.content,
    chunkIndex: chunk.chunkIndex,
    embedding: chunk.embedding,
    status: chunk.chunkStatus,
    startIndex: chunk.charStart,
    endIndex: chunk.charEnd,
    chunkType: chunk.chunkType,
    title: chunk.title,
    suggestedCategory: chunk.suggestedCategory,
    suggestedTags: chunk.suggestedTags,
    knowledgeType: chunk.knowledgeType,
    reviewStatus: chunk.reviewStatus,
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

export function mapDocumentSourceListItem(document: DocumentSourceRecord) {
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
    status: document.status,
    activeStatus: document.activeStatus,
    error: document.error,
    chunkCount: document.chunks?.length ?? 0,
    knowledgeBaseCount: document.knowledgeBases?.length ?? 0,
    uploadedAt: document.createdAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function mapDocumentSourceDetail(document: DocumentSourceRecord) {
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
    status: document.status,
    activeStatus: document.activeStatus,
    error: document.error,
    uploadedAt: document.createdAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    chunks: (document.chunks ?? []).map(mapDocumentChunk),
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
      ...mapDocumentSourceDetail(relation.document),
    })),
  };
}
