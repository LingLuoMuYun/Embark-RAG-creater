export type RagStatus = "active" | "disabled";

export type RagListItem = {
  id: string;
  name: string;
  description: string;
  icon?: string;
  documentCount: number;
  chunkCount: number;
  topK: number;
  chunkSize: number;
  similarityThreshold: number;
  status: RagStatus;
  updatedAt: string;
};

export type RagDoc = {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
};

export type RagChunk = {
  id: string;
  content: string;
  tokenCount?: number;
  charCount?: number;
  createdAt?: string;
};

export type RagDetail = RagListItem & {
  documents: RagDoc[];
};

export type KnowledgeBaseFormValues = {
  name: string;
  description: string;
  topK: number;
  chunkSize: number;
  similarityThreshold: number;
  status: RagStatus;
};

export type SortField = "updatedAt" | "documentCount";
export type SortDirection = "desc" | "asc";
export type StatusFilter = "all" | "active" | "disabled" | null;

export const DEFAULT_KNOWLEDGE_BASE_FORM_VALUES = {
  name: "",
  description: "",
  topK: 5,
  chunkSize: 500,
  similarityThreshold: 0.7,
  status: "active",
} satisfies KnowledgeBaseFormValues;
