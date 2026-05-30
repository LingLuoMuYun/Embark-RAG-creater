"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentUploader } from "@/features/document/components/document-uploader";
import { DocumentList } from "@/features/document/components/document-list";
import { DocumentPreview } from "@/features/document/components/document-preview";

export default function DocumentsPage() {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseCount, setParseCount] = useState(0);
  const handleUploaded = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleParse = useCallback(async (ids: string[]) => {
    setParseLoading(true);
    setParseCount(ids.length);
    try {
      await Promise.all(ids.map((id) =>
        fetch(`/api/documents/${id}/parse`, { method: "POST" })
      ));
    } catch {
      // error handled by list refresh
    } finally {
      setParseLoading(false);
      setRefreshKey((k) => k + 1);
    }
  }, []);

  const handlePreview = useCallback((id: string) => {
    setPreviewId(id);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* 页头 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">文档管理</h1>
          <p className="text-gray-500 mt-1">
            上传并管理文档，AI 自动从文档中提炼结构化知识，审核后沉淀到知识库
          </p>
        </div>

        {/* 上传区域 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">上传文件</h2>
          <p className="text-sm text-gray-500 mb-3">
            支持 .txt .md .csv .xlsx .docx .pdf .png .jpg .jpeg .webp .bmp 格式，最大 100MB
          </p>
          <DocumentUploader onUploaded={handleUploaded} />
        </div>

        {/* 文档列表 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">文档列表</h2>
            <button
              onClick={() => router.push("/candidates")}
              className="px-3 py-1.5 text-sm font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
            >
              审核工作台 →
            </button>
          </div>
          <DocumentList
            refreshKey={refreshKey}
            onParse={handleParse}
            onPreview={handlePreview}
          />
        </div>
      </div>

      {parseLoading && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-blue-600 px-4 py-3 text-sm text-white shadow-lg">
          {parseCount > 1 ? "正在批量解析文档..." : "正在解析文档..."}
        </div>
      )}

      <DocumentPreview
        documentId={previewId}
        onClose={() => setPreviewId(null)}
      />
    </div>
  );
}
