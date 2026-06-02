"use client";

import { useCallback, useState } from "react";

import { AdminShell } from "@/components/layout/admin-shell";
import { DocumentList } from "@/features/document/components/document-list";
import { DocumentPreview } from "@/features/document/components/document-preview";
import { DocumentUploader } from "@/features/document/components/document-uploader";

export default function DocumentsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseCount, setParseCount] = useState(0);

  const handleUploaded = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  const handleParse = useCallback(async (ids: string[]) => {
    setParseLoading(true);
    setParseCount(ids.length);
    setRefreshKey((value) => value + 1);
    try {
      await Promise.all(
        ids.map((id) => fetch(`/api/documents/${id}/parse`, { method: "POST" }))
      );
    } finally {
      setParseLoading(false);
      setRefreshKey((value) => value + 1);
    }
  }, []);

  const handlePreview = useCallback((id: string) => {
    setPreviewId(id);
  }, []);

  return (
    <AdminShell>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <p className="mb-1 text-sm font-medium text-zinc-500">知识生产</p>
          <h1 className="text-2xl font-semibold text-zinc-900">文档导入管线</h1>
          <p className="mt-1 text-sm text-zinc-500">
            上传文档、表格和图片，自动提取文本内容，智能切分后用于 AI 知识提炼。
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">上传文件</h2>
          <p className="mb-3 text-sm text-gray-500">
            支持 .txt .md .csv .xlsx .docx .pdf .png .jpg .jpeg .webp .bmp 格式，最大 100MB。
          </p>
          <DocumentUploader onUploaded={handleUploaded} />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">文档列表</h2>
          </div>
          <DocumentList
            refreshKey={refreshKey}
            onParse={handleParse}
            onPreview={handlePreview}
          />
        </div>

        {parseLoading ? (
          <div className="fixed bottom-6 right-6 rounded-lg bg-blue-600 px-4 py-3 text-sm text-white shadow-lg">
            {parseCount > 1 ? "正在批量解析文档..." : "正在解析文档..."}
          </div>
        ) : null}

        <DocumentPreview
          documentId={previewId}
          onClose={() => setPreviewId(null)}
        />
      </div>
    </AdminShell>
  );
}
