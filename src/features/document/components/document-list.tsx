"use client";

import { useEffect, useState } from "react";

interface DocumentItem {
  id: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  status: string;
  chunkCount: number;
  createdAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  uploading: { label: "上传中", color: "text-yellow-600 bg-yellow-50" },
  uploaded: { label: "待解析", color: "text-blue-600 bg-blue-50" },
  parsing: { label: "解析中", color: "text-yellow-600 bg-yellow-50" },
  parsed: { label: "已解析", color: "text-green-600 bg-green-50" },
  failed: { label: "解析失败", color: "text-red-600 bg-red-50" },
};

function getStatusDisplay(status: string) {
  return STATUS_LABELS[status] ?? { label: status, color: "text-zinc-600 bg-zinc-50" };
}

interface DocumentListProps {
  refreshKey: number;
  onParse: (id: string) => void;
  onPreview: (id: string) => void;
}

export function DocumentList({ refreshKey, onParse, onPreview }: DocumentListProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchDocuments() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/documents");
      const json = await res.json();
      if (json.success) {
        setDocuments(json.data.items);
      } else {
        throw new Error(json.error?.message || "加载失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard data fetching on mount
    fetchDocuments();
  }, [refreshKey]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`确定删除「${name}」？`)) return;
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      }
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
        <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
        加载中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        {error}
        <button onClick={fetchDocuments} className="ml-2 underline">
          重试
        </button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-zinc-400">
        暂无导入记录，请上传文件
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase text-zinc-500">
            <th className="px-4 py-3">文件名</th>
            <th className="px-4 py-3">类型</th>
            <th className="px-4 py-3">大小</th>
            <th className="px-4 py-3">分段</th>
            <th className="px-4 py-3">状态</th>
            <th className="px-4 py-3">上传时间</th>
            <th className="px-4 py-3">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {documents.map((doc) => {
            const statusDisplay = getStatusDisplay(doc.status);
            return (
              <tr key={doc.id} className="hover:bg-zinc-50">
                <td className="max-w-[200px] truncate px-4 py-3 font-medium text-zinc-900">
                  {doc.originalName}
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  .{doc.fileType}
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {formatFileSize(doc.fileSize)}
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {doc.status === "parsed" && doc.chunkCount > 0
                    ? `${doc.chunkCount} 段`
                    : doc.status === "parsing"
                      ? "..."
                      : "-"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusDisplay.color}`}
                  >
                    {statusDisplay.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {formatDate(doc.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {doc.status === "uploaded" && (
                      <button
                        onClick={() => onParse(doc.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                      >
                        解析
                      </button>
                    )}
                    {doc.status === "parsed" && (
                      <button
                        onClick={() => onPreview(doc.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50"
                      >
                        预览
                      </button>
                    )}
                    {doc.status === "failed" && (
                      <button
                        onClick={() => onParse(doc.id)}
                        className="rounded px-2 py-1 text-xs font-medium text-yellow-600 hover:bg-yellow-50"
                      >
                        重新解析
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(doc.id, doc.originalName)}
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
    </div>
  );
}
