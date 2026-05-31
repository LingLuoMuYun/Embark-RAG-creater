import { z } from "zod";

export const llmInterfaceSchema = z
  .enum(["default", "openai", "local"])
  .default("default");

export const agentChatRequestSchema = z.object({
  message: z.string().trim().min(1, "问题不能为空").max(8000),
  conversationId: z.string().trim().min(1).optional(),
  llmInterface: llmInterfaceSchema.optional(),
});

export const agentConversationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const conversationIdSchema = z.object({
  id: z.string().trim().min(1, "会话 ID 不能为空"),
});

export type AgentChatRequest = z.infer<typeof agentChatRequestSchema>;
export type LlmInterfaceKey = z.infer<typeof llmInterfaceSchema>;
export type AgentConversationListQuery = z.infer<
  typeof agentConversationListQuerySchema
>;
