"use client";

/**
 * 分类选择组件，提供知识列表筛选场景可复用的单选下拉框。
 */

import type { KnowledgeCategoryDto } from "@/features/knowledge/types";

/** 分类下拉选择组件参数。 */
type CategorySelectProps = {
  categories: KnowledgeCategoryDto[];
  value?: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (categoryId: string) => void;
};

/** 渲染分类下拉选择器，后续可复用于知识筛选栏。 */
export function CategorySelect({
  categories,
  value = "",
  disabled = false,
  placeholder = "全部分类",
  onChange,
}: CategorySelectProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-700 outline-none transition-colors hover:border-zinc-400 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400"
    >
      <option value="">{placeholder}</option>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </select>
  );
}
