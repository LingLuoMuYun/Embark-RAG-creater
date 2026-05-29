"use client";

import { useCallback, useState } from "react";

import { DocumentUploader } from "@/features/document/components/document-uploader";
import { DocumentList } from "@/features/document/components/document-list";
import { DocumentPreview } from "@/features/document/components/document-preview";

export default function DocumentsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [parseLoading, setParseLoading] = useState<string | null>(null);

  const handleUploaded = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleParse = useCallback(async (id: string) => {
    setParseLoading(id);
    try {
      await fetch(`/api/documents/${id}/parse`, { method: "POST" });
    } catch {
      // error handled by list refresh
    } finally {
      setParseLoading(null);
      setRefreshKey((k) => k + 1);
    }
  }, []);

  const handlePreview = useCallback((id: string) => {
    setPreviewId(id);
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-5xl bg-white px-6 py-10">
      <div className="mb-8">
        <p className="mb-1 text-sm font-medium text-zinc-500">知识生产</p>
        <h1 className="text-2xl font-semibold text-zinc-900">文档导入管线</h1>
        <p className="mt-1 text-sm text-zinc-500">
          上传并解析 TXT、MD、CSV、XLSX、DOCX 和 PDF 文档，提取文本内容用于 AI 知识提炼
        </p>
      </div>

      <div className="mb-8">
        <DocumentUploader onUploaded={handleUploaded} />
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-zinc-900">导入记录</h2>
      </div>

      <DocumentList
        refreshKey={refreshKey}
        onParse={handleParse}
        onPreview={handlePreview}
      />

      {parseLoading && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-blue-600 px-4 py-3 text-sm text-white shadow-lg">
          正在解析文档...
        </div>
      )}

      <DocumentPreview
        documentId={previewId}
        onClose={() => setPreviewId(null)}
      />
    </div>
  );
}
