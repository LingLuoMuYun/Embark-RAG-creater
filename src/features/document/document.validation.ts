import { z } from "zod";

const ALLOWED_TYPES = ["txt", "md", "csv", "xlsx", "docx", "pdf"] as const;

export const documentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["uploading", "uploaded", "parsing", "parsed", "failed"]).optional(),
});

export const documentIdSchema = z.object({
  id: z.string().min(1),
});

export const uploadFileSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024, "文件不能超过10MB"),
  fileType: z.enum(ALLOWED_TYPES, {
    message: "不支持的文件类型",
  }),
});

export const ALLOWED_FILE_EXTENSIONS = ALLOWED_TYPES.map((t) => `.${t}`).join(",");
