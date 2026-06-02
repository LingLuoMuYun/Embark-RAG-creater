"use client";

/**
 * 标签多选组件，提供知识列表筛选场景可复用的 tagIds 控件。
 */

import type { KnowledgeTagDto } from "@/features/knowledge/types";

/** 标签多选组件参数。 */
type TagMultiSelectProps = {
  tags: KnowledgeTagDto[];
  value: string[];
  disabled?: boolean;
  onChange: (tagIds: string[]) => void;
};

/** 渲染多选标签筛选器，后续可复用于知识筛选栏。 */
export function TagMultiSelect({
  tags,
  value,
  disabled = false,
  onChange,
}: TagMultiSelectProps) {
  const selectedTagIds = new Set(value);

  /** 切换指定标签 id 的选中状态并回传最新 tagIds。 */
  const toggleTag = (tagId: string) => {
    if (disabled) return;

    const nextTagIds = new Set(selectedTagIds);
    if (nextTagIds.has(tagId)) {
      nextTagIds.delete(tagId);
    } else {
      nextTagIds.add(tagId);
    }

    onChange(Array.from(nextTagIds));
  };

  if (tags.length === 0) {
    return <div className="text-sm text-zinc-400">暂无标签</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const selected = selectedTagIds.has(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            disabled={disabled}
            onClick={() => toggleTag(tag.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              selected
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full border border-zinc-200"
              style={{ backgroundColor: tag.color ?? "#d4d4d8" }}
            />
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}
