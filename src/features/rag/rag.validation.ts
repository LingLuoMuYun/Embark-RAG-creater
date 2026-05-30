import { z } from "zod";

export const searchQuerySchema = z.object({
  query: z.string().min(1, "查询内容不能为空"),
  topK: z.coerce.number().int().min(1).max(50).default(5),
});
