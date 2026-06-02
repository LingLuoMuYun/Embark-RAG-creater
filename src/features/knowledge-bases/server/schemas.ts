import { z } from "zod";

export const ragIconSchema = z
  .enum([
    "Database",
    "BookOpen",
    "FileText",
    "Folder",
    "Archive",
    "Brain",
    "Bot",
    "GraduationCap",
    "BriefcaseBusiness",
    "Lightbulb",
  ])
  .default("Database");

export const statusSchema = z.enum(["active", "disabled"]);
export const statusWithAllSchema = z.enum(["active", "disabled", "all"]);

export const sourceTypeSchema = z.enum([
  "manual",
  "file",
  "url",
  "text",
  "markdown",
  "image",
  "ai",
]);

export const sourceTypeWithAllSchema = z.enum([
  "manual",
  "file",
  "url",
  "text",
  "markdown",
  "image",
  "ai",
  "all",
]);

export const parseStatusSchema = z.enum([
  "pending",
  "processing",
  "success",
  "failed",
]);

export const parseStatusWithAllSchema = z.enum([
  "pending",
  "processing",
  "success",
  "failed",
  "all",
]);

export const documentChunkTypeSchema = z.enum([
  "faq",
  "concept",
  "procedure",
  "note",
  "summary",
]);

export const idParamsSchema = z.object({
  id: z.string().min(1),
});

export const knowledgeBaseListQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  status: statusWithAllSchema.optional().default("all"),
});

export const documentListQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  sourceType: sourceTypeWithAllSchema.optional().default("all"),
  status: statusWithAllSchema.optional().default("all"),
  parseStatus: parseStatusWithAllSchema.optional().default("all"),
});

export const createKnowledgeChunkSchema = z
  .object({
    content: z.string().trim().min(1),
    chunkIndex: z.number().int().min(0),
    charStart: z.number().int().min(0).optional(),
    charEnd: z.number().int().min(0).optional(),
    embedding: z.string().optional(),
    category: z.string().trim().optional(),
    type: documentChunkTypeSchema.optional().default("note"),
    status: statusSchema.optional().default("active"),
  })
  .refine(
    (value) =>
      value.charStart === undefined ||
      value.charEnd === undefined ||
      value.charEnd >= value.charStart,
    {
      message: "charEnd must be greater than or equal to charStart",
      path: ["charEnd"],
    }
  );

export const replaceKnowledgeChunksSchema = z.object({
  chunks: z.array(createKnowledgeChunkSchema),
});

const documentBaseObjectSchema = z.object({
  title: z.string().trim().min(1).optional(),
  sourceType: sourceTypeSchema.optional().default("manual"),
  originalName: z.string().trim().optional(),
  fileType: z.string().trim().optional(),
  fileName: z.string().trim().optional(),
  fileUrl: z.string().trim().optional(),
  mimeType: z.string().trim().optional(),
  fileSize: z.number().int().min(0).optional(),
  content: z.string().optional(),
  rawContent: z.string().optional(),
  parseStatus: parseStatusSchema.optional().default("pending"),
  status: z.string().trim().optional().default("uploading"),
  errorMessage: z.string().optional(),
});

export const createKnowledgeDocumentSchema = documentBaseObjectSchema
  .extend({
    chunks: z.array(createKnowledgeChunkSchema).optional(),
    knowledgeBaseIds: z.array(z.string().min(1)).optional(),
  })
  .transform((value) => ({
    ...value,
    title:
      value.title ??
      value.originalName ??
      value.fileName ??
      "未命名文档",
  }));

export const updateKnowledgeDocumentSchema = documentBaseObjectSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const createKnowledgeBaseSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(500).optional(),
  icon: ragIconSchema.optional().default("Database"),
  similarityThreshold: z.number().min(0).max(1).optional().default(0.7),
  topK: z.number().int().min(1).max(20).optional().default(5),
  status: statusSchema.optional().default("active"),
  documentIds: z.array(z.string().min(1)).optional(),
  documents: z.array(createKnowledgeDocumentSchema).optional(),
});

export const updateKnowledgeBaseSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    description: z.string().trim().max(500).optional(),
    icon: ragIconSchema.optional(),
    similarityThreshold: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(1).max(20).optional(),
    status: statusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const documentIdsBodySchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1),
});

export type CreateKnowledgeBaseInput = z.infer<
  typeof createKnowledgeBaseSchema
>;
export type UpdateKnowledgeBaseInput = z.infer<
  typeof updateKnowledgeBaseSchema
>;
export type CreateKnowledgeDocumentInput = z.infer<
  typeof createKnowledgeDocumentSchema
>;
export type UpdateKnowledgeDocumentInput = z.infer<
  typeof updateKnowledgeDocumentSchema
>;
export type CreateKnowledgeChunkInput = z.infer<
  typeof createKnowledgeChunkSchema
>;
