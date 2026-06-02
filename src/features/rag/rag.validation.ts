import { z } from "zod";

export const knowledgeChunkTypeSchema = z.enum([
  "faq",
  "concept",
  "procedure",
  "note",
  "summary",
]);

export const ragRetrieveRequestSchema = z.object({
  query: z.string().trim().min(1, "问题不能为空"),
  scope: z.object({
    knowledgeBaseIds: z.array(z.string().min(1)).min(1, "至少需要选择一个知识库"),
    knowledgeIds: z.array(z.string().min(1)).optional(),
    categories: z.array(z.string().trim().min(1)).optional(),
    tagIds: z.array(z.string().min(1)).optional(),
    types: z.array(knowledgeChunkTypeSchema).optional(),
  }),
  mode: z.enum(["fast", "balanced", "detailed"]).default("balanced"),
});

export type RagRetrieveRequestInput = z.infer<typeof ragRetrieveRequestSchema>;
