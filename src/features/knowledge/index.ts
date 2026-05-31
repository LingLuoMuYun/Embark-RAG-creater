/**
 * 知识组织模块统一导出入口，供页面侧接入分类和标签能力。
 */

export type {
  KnowledgeCategoryDto,
  KnowledgeCategoryFormValues,
  KnowledgeTagDto,
  KnowledgeTagFormValues,
} from "@/features/knowledge/types";

export {
  CategoryForm,
  CategoryManager,
  CategorySelect,
  KnowledgeFilterBar,
  KnowledgeSearchBox,
  TagForm,
  TagManager,
  TagMultiSelect,
} from "@/features/knowledge/components";

export type {
  KnowledgeFilterBarProps,
  KnowledgeSearchBoxProps,
} from "@/features/knowledge/components";
