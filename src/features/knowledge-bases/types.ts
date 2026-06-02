export type RagStatus = "active" | "disabled";

export type RagIconName =
  | "Database"
  | "BookOpen"
  | "FileText"
  | "Folder"
  | "Archive"
  | "Brain"
  | "Bot"
  | "GraduationCap"
  | "BriefcaseBusiness"
  | "Lightbulb";

export type RagListItem = {
  id: string;
  name: string;
  description: string;
  icon: RagIconName;
  documentCount: number;
  chunkCount: number;
  topK: number;
  similarityThreshold: number;
  status: RagStatus;
  updatedAt: string;
};

export type RagDoc = {
  id: string;
  title: string;
  name: string;
  sourceType: string;
  fileName?: string | null;
  fileUrl?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  rawContent?: string | null;
  parseStatus: string;
  status: string;
  error?: string | null;
  chunkCount: number;
  size: number;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
  chunks?: RagChunk[];
};

export type RagChunk = {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  embedding?: string | null;
  category?: string | null;
  type: "faq" | "concept" | "procedure" | "note" | "summary" | string;
  status: string;
  startIndex?: number | null;
  endIndex?: number | null;
  tokenCount?: number;
  charCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type RagDetail = RagListItem;

export type KnowledgeBaseFormValues = {
  name: string;
  description: string;
  icon: RagIconName;
  topK: number;
  similarityThreshold: number;
  status: RagStatus;
};

export type SortField = "updatedAt" | "documentCount";
export type SortDirection = "desc" | "asc";
export type StatusFilter = "all" | "active" | "disabled" | null;

export const DEFAULT_KNOWLEDGE_BASE_FORM_VALUES = {
  name: "",
  description: "",
  icon: "Database",
  topK: 5,
  similarityThreshold: 0.7,
  status: "active",
} satisfies KnowledgeBaseFormValues;
