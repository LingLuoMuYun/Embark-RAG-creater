import { z } from "zod";

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "分类名称不能为空")
  .max(30, "分类名称不能超过 30 个字符");

const optionalDescriptionSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z
    .union([z.string().max(200, "分类描述不能超过 200 个字符"), z.null()])
    .optional()
).transform((value) => (value === "" ? null : value));

const optionalColorSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmedValue = value.trim();
    return trimmedValue === "" ? null : trimmedValue;
  },
  z
    .union([
      z.string().regex(/^#[0-9a-fA-F]{6}$/, "分类颜色必须是 6 位 hex 色值"),
      z.null(),
    ])
    .optional()
);

export const categoryCreateSchema = z.object({
  name: categoryNameSchema,
  description: optionalDescriptionSchema,
  color: optionalColorSchema,
  sortOrder: z.coerce.number().int("分类排序必须是整数").default(0),
});

export const categoryUpdateSchema = z
  .object({
    name: categoryNameSchema.optional(),
    description: optionalDescriptionSchema,
    color: optionalColorSchema,
    sortOrder: z.coerce.number().int("分类排序必须是整数").optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "至少需要提供一个要更新的字段",
  });

export const categoryListQuerySchema = z.object({
  keyword: z
    .string()
    .trim()
    .max(50, "搜索关键词不能超过 50 个字符")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export const categoryIdSchema = z.object({
  id: z.string().min(1, "分类 id 不能为空"),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
