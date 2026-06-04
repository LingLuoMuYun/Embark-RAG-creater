"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchCategories } from "@/features/knowledge/api/categories";
import type { KnowledgeCategoryDto } from "@/features/knowledge/types";

type KnowledgeCategoryScopeSelectProps = {
  value: string[];
  onChange: (nextValues: string[]) => void;
};

export function KnowledgeCategoryScopeSelect({
  value,
  onChange,
}: KnowledgeCategoryScopeSelectProps) {
  const [items, setItems] = useState<KnowledgeCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadCategories() {
      setLoading(true);
      setError(null);

      try {
        const nextItems = await fetchCategories();
        if (mounted) {
          setItems(nextItems);
        }
      } catch (loadError) {
        if (mounted) {
          setError(
            loadError instanceof Error ? loadError.message : "分类列表加载失败"
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadCategories();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedValues = useMemo(() => new Set(value), [value]);
  const knownValues = useMemo(
    () => new Set(items.flatMap((item) => [item.id, item.name])),
    [items]
  );
  const missingValues = value.filter((item) => !knownValues.has(item));

  const toggleCategory = (category: KnowledgeCategoryDto) => {
    const checked =
      selectedValues.has(category.name) || selectedValues.has(category.id);

    if (checked) {
      onChange(
        value.filter((item) => item !== category.name && item !== category.id)
      );
      return;
    }

    onChange([...value, category.name]);
  };

  const clearSelection = () => {
    onChange([]);
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-zinc-800">限定分类</div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            可选。按成员 B 的全局分类进一步缩小 Agent 检索范围。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-500">
            可选 · {value.length}
          </span>
          {value.length > 0 ? (
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800"
            >
              清空
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="rounded-md border border-dashed border-zinc-200 bg-white px-3 py-5 text-center text-sm text-zinc-500">
          正在加载分类...
        </div>
      ) : error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-200 bg-white px-3 py-5 text-center text-sm text-zinc-500">
          暂无分类。未选择分类时，Agent 会在已绑定知识库内检索全部分类。
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => {
            const checked =
              selectedValues.has(item.name) || selectedValues.has(item.id);

            return (
              <label
                key={item.id}
                className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors ${
                  checked
                    ? "border-cyan-300 bg-cyan-50 text-cyan-800"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleCategory(item)}
                  className="h-3.5 w-3.5"
                />
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color ?? "#d4d4d8" }}
                />
                {item.name}
              </label>
            );
          })}
        </div>
      )}

      {missingValues.length > 0 ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          已保存的部分分类当前不存在，仍会保留：
          {missingValues.join("、")}
        </div>
      ) : null}
    </div>
  );
}
