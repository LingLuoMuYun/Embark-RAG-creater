export type KnowledgeChunkStatus = "pending" | "available" | "disabled";

export type KnowledgeSourceType =
  | "manual"
  | "file"
  | "url"
  | "text"
  | "markdown"
  | "image"
  | "ai"
  | "import";

export type KnowledgeChunkType =
  | "faq"
  | "concept"
  | "procedure"
  | "note"
  | "summary";

export type RetrievalMode = "fast" | "balanced" | "detailed";

export type KnowledgeChunk = {
  id: string;
  knowledgeBaseId: string;
  knowledgeId: string;
  title: string;
  content: string;
  summary?: string;
  category?: string;
  tagIds?: string[];
  status: KnowledgeChunkStatus;
  sourceType: KnowledgeSourceType;
  chunkType: KnowledgeChunkType;
  chunkIndex: number;
  parentChunkId?: string;
  prevChunkId?: string;
  nextChunkId?: string;
  sourceChunkIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type RagRetrieveScope = {
  knowledgeBaseIds: string[];
  knowledgeIds?: string[];
  categories?: string[];
  tagIds?: string[];
  types?: KnowledgeChunkType[];
};

export type RagRetrieveRequest = {
  query: string;
  scope: RagRetrieveScope;
  mode?: RetrievalMode;
};

export type RagContext = {
  id: string;
  knowledgeBaseId: string;
  knowledgeId: string;
  chunkId: string;
  title: string;
  content: string;
  chunkType: KnowledgeChunkType;
  score: number;
  category?: string;
  tagIds?: string[];
  metadata?: Record<string, unknown>;
};

export type RagReference = {
  refId: string;
  knowledgeBaseId: string;
  knowledgeId: string;
  chunkId: string;
  title: string;
  chunkType: KnowledgeChunkType;
};

export type RagRetrieveMetrics = {
  fallback: boolean;
  fallbackReason?: "below_min_score_but_keep_top1" | "no_relevant_context";
  minScore: number;
  fallbackTop1Score: number;
  beforeMinScoreCount: number;
  afterMinScoreCount: number;
  topScore?: number;
};

export type RagRetrieveResponse = {
  query: string;
  contexts: RagContext[];
  llmContext: string;
  references: RagReference[];
  metrics?: RagRetrieveMetrics;
};
