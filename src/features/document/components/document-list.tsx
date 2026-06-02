"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type DocumentItem = {
  id: string;
  title?: string | null;
  originalName?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  status: string;
  chunkCount: number;
  candidateConfirmed?: number;
  createdAt: string;
};

type DocumentListProps = {
  refreshKey: number;
  onParse: (ids: string[]) => void;
  onPreview: (id: string) => void;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  uploading: { label: "上传中", color: "text-yellow-600 bg-yellow-50" },
  uploaded: { label: "待解析", color: "text-blue-600 bg-blue-50" },
  parsing: { label: "解析中", color: "text-yellow-600 bg-yellow-50" },
  parsed: { label: "已解析", color: "text-green-600 bg-green-50" },
  failed: { label: "解析失败", color: "text-red-600 bg-red-50" },
};

const FILTER_OPTIONS = [
  { key: "", label: "全部" },
  { key: "uploaded", label: "待解析" },
  { key: "parsing", label: "解析中" },
  { key: "parsed", label: "已解析" },
  { key: "failed", label: "失败" },
];

function formatFileSize(bytes?: number | null): string {
  const value = bytes ?? 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString("zh-CN");
}

function getStatusDisplay(status: string) {
  return (
    STATUS_LABELS[status] ?? { label: status, color: "text-zinc-600 bg-zinc-50" }
  );
}

function getDocumentTitle(document: DocumentItem) {
  return document.title ?? document.originalName ?? document.fileName ?? "未命名文档";
}

export function DocumentList({
  refreshKey,
  onParse,
  onPreview,
}: DocumentListProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [extractMsg, setExtractMsg] = useState<string | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const pageSize = 10;

  const selectedList = Array.from(selected);
  const someSelected = selected.size > 0 && selected.size < documents.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const parseIds = selectedList.filter((id) => {
    const doc = documents.find((item) => item.id === id);
    return doc && (doc.status === "uploaded" || doc.status === "failed");
  });

  const fetchDocuments = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/documents?${params.toString()}`);
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error?.message || "加载失败");
      }
      setDocuments(json.data.items);
      setTotal(json.data.total);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  useEffect(() => {
    void Promise.resolve().then(fetchDocuments);
  }, [fetchDocuments, refreshKey]);

  useEffect(() => {
    if (!extractMsg) return;
    const timer = setTimeout(() => setExtractMsg(null), 6000);
    return () => clearTimeout(timer);
  }, [extractMsg]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (documents.length === 0) return;
    const allSelected = documents.every((document) => selected.has(document.id));
    setSelected((prev) => {
      const next = new Set(prev);
      documents.forEach((document) => {
        if (allSelected) next.delete(document.id);
        else next.add(document.id);
      });
      return next;
    });
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`确定删除《${name}》？`)) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.success) {
      await fetchDocuments();
    }
  }

  async function handleBatchDelete() {
    if (selectedList.length === 0 || batchDeleting) return;
    if (!confirm(`确定删除选中的 ${selectedList.length} 个文档？`)) return;
    setBatchDeleting(true);
    try {
      await fetch("/api/documents/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedList }),
      });
      await fetchDocuments();
    } finally {
      setBatchDeleting(false);
    }
  }

  async function handleExtract(id: string) {
    setExtractingId(id);
    setExtractMsg(null);
    try {
      const res = await fetch("/api/ai/extract/from-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id }),
      });
      const json = await res.json();
      if (json.success) {
        setExtractMsg(`提炼完成，生成 ${json.data.dedupedCandidateCount} 条知识分片`);
        await fetchDocuments();
      } else {
        setExtractMsg(json.error?.message || "提炼失败");
      }
    } catch {
      setExtractMsg("网络错误，请重试");
    } finally {
      setExtractingId(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.key}
            onClick={() => {
              setFilter(option.key);
              setPage(1);
              setSelected(new Set());
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === option.key
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {option.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {parseIds.length > 0 ? (
            <button
              onClick={() => onParse(parseIds)}
              disabled={batchDeleting}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              批量解析（{parseIds.length}）
            </button>
          ) : null}
          {selectedList.length > 0 ? (
            <button
              onClick={handleBatchDelete}
              disabled={batchDeleting}
              className="rounded bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              {batchDeleting ? "删除中..." : `批量删除（${selectedList.length}）`}
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
          加载中...
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
          <button onClick={() => fetchDocuments()} className="ml-2 underline">
            重试
          </button>
        </div>
      ) : documents.length === 0 ? (
        <div className="py-16 text-center text-sm text-zinc-400">
          {filter ? "该状态下暂无记录" : "暂无导入记录，请上传文件"}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    checked={documents.length > 0 && selected.size === documents.length}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 rounded"
                  />
                </th>
                <th className="px-4 py-3">文件名</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">大小</th>
                <th className="px-4 py-3">分片</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">上传时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {documents.map((document) => {
                const statusDisplay = getStatusDisplay(document.status);
                const title = getDocumentTitle(document);

                return (
                  <tr key={document.id} className="hover:bg-zinc-50">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(document.id)}
                        onChange={() => toggleSelect(document.id)}
                        className="h-3.5 w-3.5 rounded border-zinc-300"
                      />
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 font-medium text-zinc-900">
                      {title}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {document.fileType ? `.${document.fileType}` : "-"}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {formatFileSize(document.fileSize)}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {document.chunkCount > 0 ? `${document.chunkCount} 段` : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusDisplay.color}`}
                      >
                        {statusDisplay.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {formatDate(document.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {(document.status === "uploaded" ||
                          document.status === "failed") && (
                          <button
                            onClick={() => onParse([document.id])}
                            className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                          >
                            解析
                          </button>
                        )}
                        {document.status === "parsed" ? (
                          <>
                            <button
                              onClick={() => onPreview(document.id)}
                              className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50"
                            >
                              预览
                            </button>
                            <button
                              onClick={() => handleExtract(document.id)}
                              disabled={extractingId === document.id}
                              className="rounded px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 disabled:opacity-50"
                            >
                              {extractingId === document.id ? "提炼中..." : "提炼"}
                            </button>
                          </>
                        ) : null}
                        <button
                          onClick={() => handleDelete(document.id, title)}
                          className="rounded px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3">
            <span className="text-xs text-zinc-500">
              共 {total} 条记录，第 {page}/{totalPages} 页
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
                className="rounded px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                上一页
              </button>
              <button
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={page >= totalPages}
                className="rounded px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          </div>

          {extractMsg ? (
            <div
              className={`border-t px-4 py-3 text-sm ${
                extractMsg.includes("完成")
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {extractMsg}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
