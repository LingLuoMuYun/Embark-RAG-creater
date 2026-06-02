import type { RagRetrieveRequest } from "@/features/rag/types";

export const smokeTestRetrieveRequest: RagRetrieveRequest = {
  query: "如何给成员配置管理员权限？",
  scope: {
    knowledgeBaseIds: ["kb_001"],
    categories: ["权限"],
    types: ["faq", "procedure", "concept"],
  },
  mode: "balanced",
};
