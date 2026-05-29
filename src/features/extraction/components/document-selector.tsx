"use client";

import { useState, useEffect, useCallback } from "react";

interface ParsedDocument {
  id: string;
  originalName: string;
  fileType: string;
  chunkCount: number;
  createdAt: string;
}

interface Props {
  onExtract: (documentId: string, docName: string) => void;
  loading: boolean;
}

const fileTypeBadge: Record<string, string> = {
  pdf: "bg-red-100 text-red-700",
  docx: "bg-blue-100 text-blue-700",
  txt: "bg-gray-100 text-gray-600",
  md: "bg-purple-100 text-purple-700",
  markdown: "bg-purple-100 text-purple-700",
};

export default function DocumentSelector({
  onExtract,
  loading,
}: Props) {
  const [documents, setDocuments] = useState<ParsedDocument[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setFetching(true);
    setError("");
    try {
      const res = await fetch(
        "/api/documents?status=parsed&pageSize=100"
      );
      const data = await res.json();
      if (data.success) {
        setDocuments(data.data.items ?? []);
      } else {
        setError(data.error?.message || "获取文档列表失败");
      }
    } catch {
      setError("无法获取文档列表，请确认文档服务可用");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleExtract = () => {
    if (!selectedId || loading) return;
    const doc = documents.find((d) => d.id === selectedId);
    onExtract(selectedId, doc?.originalName || "未知文档");
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-gray-800">
          从文档库选择
        </h2>
        <div className="flex items-center gap-3">
          {!fetching && !error && (
            <span className="text-xs text-gray-400">
              共 {documents.length} 篇已解析文档
            </span>
          )}
          <button
            onClick={fetchDocuments}
            disabled={fetching || loading}
            className="px-3 py-1 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {fetching ? "刷新中..." : "刷新"}
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                无法获取文档列表
              </p>
              <p className="text-xs text-amber-600 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* 加载中 */}
      {fetching && (
        <div className="text-center py-8 text-gray-400">
          <svg
            className="animate-spin h-6 w-6 mx-auto mb-2"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-sm">正在获取已解析文档列表...</p>
        </div>
      )}

      {/* 空状态 */}
      {!fetching && !error && documents.length === 0 && (
        <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
          <svg
            className="mx-auto h-10 w-10 mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          <p className="text-sm">暂无已解析的文档</p>
          <p className="text-xs mt-1">
            请先在文档导入页面上传并解析文档
          </p>
        </div>
      )}

      {/* 文档列表 */}
      {!fetching && !error && documents.length > 0 && (
        <>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="max-h-80 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="w-10 px-4 py-2.5" />
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">
                      文档名称
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">
                      类型
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                      分段数
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">
                      上传时间
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      onClick={() => setSelectedId(doc.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedId === doc.id
                          ? "bg-blue-50 ring-1 ring-blue-200"
                          : "hover:bg-gray-50"
                      } ${loading ? "pointer-events-none opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="radio"
                          name="doc-select"
                          checked={selectedId === doc.id}
                          onChange={() => setSelectedId(doc.id)}
                          disabled={loading}
                          className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <svg
                            className="h-4 w-4 text-gray-400 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                            />
                          </svg>
                          <span className="text-sm font-medium text-gray-900 truncate max-w-[200px] sm:max-w-[300px]">
                            {doc.originalName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
                            fileTypeBadge[doc.fileType] ||
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {doc.fileType.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span
                          className={`text-sm ${
                            doc.chunkCount > 3
                              ? "text-amber-600 font-medium"
                              : "text-gray-600"
                          }`}
                        >
                          {doc.chunkCount} 段
                          {doc.chunkCount > 3 && (
                            <span
                              className="text-xs text-amber-500 ml-1"
                              title="大文档，提炼耗时较长"
                            >
                              ⚠
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                        {formatDate(doc.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExtract}
              disabled={!selectedId || loading}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  AI 提炼中...
                </>
              ) : (
                "AI 提炼知识"
              )}
            </button>
            {selectedId && (
              <span className="text-xs text-gray-400">
                已选择:{" "}
                {
                  documents.find((d) => d.id === selectedId)
                    ?.originalName
                }
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
