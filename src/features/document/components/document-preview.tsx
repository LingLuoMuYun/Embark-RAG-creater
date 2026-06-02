"use client";

import { useCallback, useEffect, useState } from "react";

type DocInfo = {
  id: string;
  title?: string | null;
  originalName?: string | null;
  fileName?: string | null;
  content: string | null;
  status: string;
};

type ChunkItem = {
  id: string;
  chunkIndex: number;
  content: string;
  category?: string | null;
  type?: string | null;
};

type DocumentPreviewProps = {
  documentId: string | null;
  onClose: () => void;
};

type Tab = "text" | "segments";

export function DocumentPreview({ documentId, onClose }: DocumentPreviewProps) {
  const [tab, setTab] = useState<Tab>("text");
  const [docInfo, setDocInfo] = useState<DocInfo | null>(null);
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editTextSaving, setEditTextSaving] = useState(false);

  const fetchData = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [docRes, chunkRes] = await Promise.all([
        fetch(`/api/documents/${id}`),
        fetch(`/api/documents/${id}/chunks`),
      ]);
      const docData = await docRes.json();
      const chunkData = await chunkRes.json();

      if (!docData.success) {
        throw new Error(docData.error?.message || "文档加载失败");
      }

      setDocInfo(docData.data);
      setEditText(docData.data.content || "");
      setChunks(chunkData.success ? chunkData.data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!documentId) return;
    void Promise.resolve().then(() => {
      setTab("text");
      return fetchData(documentId);
    });
  }, [documentId, fetchData]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  async function handleSaveText() {
    if (!docInfo) return;
    setEditTextSaving(true);
    try {
      const res = await fetch(`/api/documents/${docInfo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editText }),
      });
      const json = await res.json();
      if (json.success) {
        setDocInfo(json.data);
        await fetchData(docInfo.id);
      }
    } finally {
      setEditTextSaving(false);
    }
  }

  if (!documentId) return null;

  const title =
    docInfo?.title ?? docInfo?.originalName ?? docInfo?.fileName ?? "文档预览";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="mx-4 flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-3">
          <h2 className="text-lg font-semibold text-zinc-900">
            {loading ? "加载中..." : title}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            ×
          </button>
        </div>

        <div className="flex border-b border-zinc-200">
          {[
            { key: "text" as const, label: "原文内容" },
            { key: "segments" as const, label: `文档分片${chunks.length ? `（${chunks.length}）` : ""}` },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === item.key
                  ? "border-b-2 border-blue-500 text-blue-600"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-16 text-center text-sm text-zinc-500">
              加载中...
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : tab === "text" ? (
            <div className="space-y-4">
              <textarea
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                rows={18}
                className="w-full resize-y rounded-lg border border-zinc-300 px-4 py-3 text-sm leading-relaxed text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSaveText}
                  disabled={editText === (docInfo?.content || "") || editTextSaving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {editTextSaving ? "保存中..." : "保存修改"}
                </button>
              </div>
            </div>
          ) : chunks.length === 0 ? (
            <div className="py-16 text-center text-sm text-zinc-400">
              暂无分片数据
            </div>
          ) : (
            <div className="space-y-3">
              {chunks.map((chunk, index) => (
                <div
                  key={chunk.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50"
                >
                  <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-1.5">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>第 {index + 1} 段</span>
                      {chunk.type ? <span>{chunk.type}</span> : null}
                      {chunk.category ? <span>{chunk.category}</span> : null}
                    </div>
                    <span className="text-xs text-zinc-400">
                      {chunk.content.length.toLocaleString()} 字
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap break-words px-3 py-3 text-sm leading-relaxed text-gray-700">
                    {chunk.content}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
