"use client";

import { useEffect, useState } from "react";

interface ChunkData {
  id: string;
  chunkIndex: number;
  content: string;
  charStart: number;
  charEnd: number;
}

interface PreviewData {
  id: string;
  originalName: string;
  content: string | null;
  status: string;
  chunkCount?: number;
  errorMessage: string | null;
}

interface DocumentPreviewProps {
  documentId: string | null;
  onClose: () => void;
}

type ViewMode = "full" | "chunks";

export function DocumentPreview({ documentId, onClose }: DocumentPreviewProps) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("full");
  const [loading, setLoading] = useState(false);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard data fetching reset before async
    setLoading(true);
    setError(null);
    setChunks([]);
    setViewMode("full");
    fetch(`/api/documents/${documentId}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success) {
          setData(json.data);
        } else {
          throw new Error(json.error?.message || "加载失败");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  async function fetchChunks() {
    if (!documentId || chunks.length > 0) return;
    setChunksLoading(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/chunks`);
      const json = await res.json();
      if (json.success) {
        setChunks(json.data);
      }
    } catch {
      // ignore
    } finally {
      setChunksLoading(false);
    }
  }

  function handleTabChange(mode: ViewMode) {
    setViewMode(mode);
    if (mode === "chunks") fetchChunks();
  }

  if (!documentId) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            {loading ? "加载中..." : data?.originalName || "文档预览"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        {data?.status === "parsed" && (data?.chunkCount ?? 0) > 0 && (
          <div className="flex border-b border-zinc-200">
            <button
              onClick={() => handleTabChange("full")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                viewMode === "full"
                  ? "border-b-2 border-blue-500 text-blue-600"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              全文
            </button>
            <button
              onClick={() => handleTabChange("chunks")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                viewMode === "chunks"
                  ? "border-b-2 border-blue-500 text-blue-600"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              分段（{data?.chunkCount ?? 0} 段）
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              加载中...
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : data?.status === "parsed" && data.content ? (
            viewMode === "full" ? (
              <pre className="whitespace-pre-wrap break-words rounded bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700">
                {data.content}
              </pre>
            ) : chunksLoading ? (
              <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                加载分段数据...
              </div>
            ) : (
              <div className="space-y-4">
                {chunks.map((chunk, i) => (
                  <div
                    key={chunk.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-1.5">
                      <span className="text-xs font-medium text-zinc-500">
                        第 {i + 1} 段
                      </span>
                      <span className="text-xs text-zinc-400">
                        字符 {chunk.charStart + 1}–{chunk.charEnd} &middot;{" "}
                        {chunk.content.length.toLocaleString()} 字
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words px-3 py-3 text-sm leading-relaxed text-zinc-700">
                      {chunk.content}
                    </pre>
                  </div>
                ))}
              </div>
            )
          ) : data?.status === "failed" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              解析失败：{data.errorMessage || "未知错误"}
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-zinc-400">
              {data?.status === "uploaded"
                ? "文档尚未解析"
                : data?.status === "parsing"
                  ? "正在解析中..."
                  : "暂无内容"}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-200 px-6 py-3">
          <p className="text-xs text-zinc-400">
            状态：
            {data?.status === "parsed"
              ? "已解析"
              : data?.status === "failed"
                ? "解析失败"
                : data?.status === "parsing"
                  ? "解析中"
                  : data?.status === "uploaded"
                    ? "待解析"
                    : data?.status || "未知"}
            {data?.content && (
              <>
                {" "}&middot; 总字符：{data.content.length.toLocaleString()}
              </>
            )}
            {(data?.chunkCount ?? 0) > 0 && (
              <>
                {" "}&middot; 切分段数：{data?.chunkCount ?? 0}
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
