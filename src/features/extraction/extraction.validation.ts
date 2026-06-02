import { z } from "zod";

export const extractedChunkTypeSchema = z.enum([
  "faq",
  "concept",
  "procedure",
  "note",
  "summary",
]);

export const extractedChunkSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1),
  category: z.string().trim().optional(),
  suggestedCategory: z.string().trim().optional(),
  suggestedTags: z.array(z.string()).optional(),
  type: extractedChunkTypeSchema.default("note"),
});

export const ExtractedChunkSchema = extractedChunkSchema;
export const ExtractedChunksSchema = z.array(extractedChunkSchema);

export type ExtractedChunk = z.infer<typeof extractedChunkSchema>;

export const ExtractRequestSchema = z.object({
  text: z.string().min(1, "文本不能为空").max(50000, "文本不能超过 50000 字"),
  source: z.enum(["document", "text"]).default("text"),
  documentSourceId: z.string().min(1).optional(),
});

export const FromDocumentRequestSchema = z.object({
  documentId: z.string().min(1, "文档 ID 不能为空"),
});

export const RetryRequestSchema = z.object({
  documentId: z.string().min(1, "文档 ID 不能为空"),
});
