/**
 * 知识组织模块统一导出入口，供页面侧接入分类和标签能力。
 */

export type {
  KnowledgeCategoryDto,
  KnowledgeCategoryFormValues,
  KnowledgeFilterValue,
  KnowledgeTagDto,
  KnowledgeTagFormValues,
  KnowledgeStatusFilter,
  RecentKnowledgeSearch,
  UseRecentKnowledgeSearchesOptions,
} from "@/features/knowledge/types";

export {
  CategoryForm,
  CategoryManager,
  CategorySelect,
  KnowledgeFilterBar,
  KnowledgeSearchBox,
  RecentSearches,
  SearchHighlight,
  TagForm,
  TagManager,
  TagMultiSelect,
} from "@/features/knowledge/components";

export type {
  KnowledgeFilterBarProps,
  KnowledgeSearchBoxProps,
  RecentSearchesProps,
  SearchHighlightProps,
} from "@/features/knowledge/components";

export { useRecentKnowledgeSearches } from "@/features/knowledge/hooks/use-recent-knowledge-searches";
