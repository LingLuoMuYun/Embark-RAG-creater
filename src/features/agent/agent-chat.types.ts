import type {
  KnowledgeChunkType,
  RagContext,
  RagRetrieveResponse,
} from "@/features/rag/types";

export type ChatRole = "user" | "assistant" | "system";

export type ChatCitation = {
  refId: string;
  chunkId: string;
  knowledgeId: string;
  documentId: string;
  knowledgeBaseId: string;
  title: string;
  content: string;
  chunkType: KnowledgeChunkType;
  score: number;
};

export type ChatKnowledgeFile = {
  id: string;
  title: string;
  chunkCount: number;
};

export type ChatMessageDTO = {
  id: string;
  role: Exclude<ChatRole, "system">;
  content: string;
  citations: ChatCitation[];
  knowledgeFiles?: ChatKnowledgeFile[];
  createdAt: string;
};

export type AgentConversationDTO = {
  id: string;
  agentId: string;
  title: string;
  memorySummary: string | null;
  memoryCursorMessageId: string | null;
  memoryFailureCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentChatContext = {
  retrieve: RagRetrieveResponse;
  contexts: RagContext[];
  citations: ChatCitation[];
};
