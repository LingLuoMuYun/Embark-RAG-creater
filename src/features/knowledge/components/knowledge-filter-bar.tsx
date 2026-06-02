"use client";

/**
 * 知识筛选栏组件，组合分类、标签和状态筛选控件。
 */

import { CategorySelect } from "@/features/knowledge/components/category-select";
import { TagMultiSelect } from "@/features/knowledge/components/tag-multi-select";
import type {
  KnowledgeCategoryDto,
  KnowledgeFilterValue,
  KnowledgeStatusFilter,
  KnowledgeTagDto,
} from "@/features/knowledge/types";

const STATUS_OPTIONS: Array<{ value: KnowledgeStatusFilter; label: string }> = [
  { value: "available", label: "可用" },
  { value: "pending", label: "待确认" },
  { value: "disabled", label: "不可用" },
];

export type KnowledgeFilterBarProps = {
  value: KnowledgeFilterValue;
  categories: KnowledgeCategoryDto[];
  tags: KnowledgeTagDto[];
  disabled?: boolean;
  showReset?: boolean;
  onChange: (value: KnowledgeFilterValue) => void;
  onReset?: () => void;
};

/** 渲染知识筛选栏，不直接拉取数据或执行过滤。 */
export function KnowledgeFilterBar({
  value,
  categories,
  tags,
  disabled = false,
  showReset = true,
  onChange,
  onReset,
}: KnowledgeFilterBarProps) {
  const hasActiveFilter =
    Boolean(value.categoryId) ||
    value.tagIds.length > 0 ||
    Boolean(value.status);

  /** 更新分类筛选值。 */
  const handleCategoryChange = (categoryId: string) => {
    onChange({
      ...value,
      categoryId: categoryId || undefined,
    });
  };

  /** 更新标签筛选值。 */
  const handleTagsChange = (tagIds: string[]) => {
    onChange({
      ...value,
      tagIds,
    });
  };

  /** 更新状态筛选值，空字符串表示全部状态。 */
  const handleStatusChange = (status: string) => {
    onChange({
      ...value,
      status: status ? (status as KnowledgeStatusFilter) : undefined,
    });
  };

  /** 清空所有筛选条件并通知调用方。 */
  const resetFilters = () => {
    if (disabled) return;
    onChange({ tagIds: [] });
    onReset?.();
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(180px,220px)_minmax(180px,220px)_minmax(0,1fr)_auto] lg:items-start">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">
            分类
          </span>
          <CategorySelect
            categories={categories}
            value={value.categoryId ?? ""}
            disabled={disabled}
            onChange={handleCategoryChange}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">
            状态
          </span>
          <select
            value={value.status ?? ""}
            disabled={disabled}
            onChange={(event) => handleStatusChange(event.target.value)}
            className="h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none transition-colors hover:border-zinc-400 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
          >
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="mb-1 block text-xs font-medium text-zinc-600">
            标签
          </span>
          <TagMultiSelect
            tags={tags}
            value={value.tagIds}
            disabled={disabled}
            onChange={handleTagsChange}
          />
        </div>

        {showReset && (
          <div className="flex lg:justify-end lg:pt-6">
            <button
              type="button"
              disabled={disabled || !hasActiveFilter}
              onClick={resetFilters}
              className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              重置筛选
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
