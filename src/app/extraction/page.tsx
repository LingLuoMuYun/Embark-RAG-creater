"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TextInput from "@/features/extraction/components/text-input";
import DocumentSelector from "@/features/extraction/components/document-selector";

type InputMode = "text" | "document";

export default function ExtractionPage() {
  const [mode, setMode] = useState<InputMode>("text");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    count: number;
    documentName?: string;
  } | null>(null);
  const router = useRouter();

  const handleTextExtract = async (text: string) => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/ai/extract/from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: "text" }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error?.message || "提炼失败");
        return;
      }

      setResult({ count: data.data.count });
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentExtract = async (
    documentId: string,
    _docName: string
  ) => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/ai/extract/from-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error?.message || "提炼失败");
        return;
      }

      setResult({
        count: data.data.dedupedCandidateCount,
        documentName: data.data.documentName,
      });
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* 页头 */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            AI 知识提炼
          </h1>
          <p className="text-gray-500 mt-1">
            粘贴文本或从文档库选择材料，AI 将自动提炼结构化知识条目。所有生成的知识需人工审核后方可入库。
          </p>
        </div>

        {/* 模式切换 */}
        <div className="flex gap-2 flex-wrap items-center">
          {[
            { key: "text" as const, label: "粘贴文本" },
            { key: "document" as const, label: "从文档库选择" },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setMode(m.key);
                setError("");
                setResult(null);
              }}
              disabled={loading}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                mode === m.key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {m.label}
            </button>
          ))}

          <div className="ml-auto">
            <button
              onClick={() => router.push("/candidates")}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
            >
              审核工作台 →
            </button>
          </div>
        </div>

        {/* 输入区 */}
        {mode === "document" ? (
          <DocumentSelector
            onExtract={handleDocumentExtract}
            loading={loading}
          />
        ) : (
          <TextInput onExtract={handleTextExtract} loading={loading} />
        )}

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* 成功结果 */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <p className="text-lg font-medium text-green-800">
              提炼完成！共生成 {result.count} 条候选知识
            </p>
            {result.documentName && (
              <p className="text-sm text-green-600 mt-1">
                来源文档: {result.documentName}
              </p>
            )}
            <p className="text-sm text-green-600 mt-1">
              请在审核工作台中查看、编辑和确认
            </p>
            <button
              onClick={() => router.push("/candidates")}
              className="mt-4 px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              前往审核工作台
            </button>
          </div>
        )}

        {/* 流程说明 */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="font-semibold text-gray-800 mb-3">
            模块使用流程
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            {[
              { step: "1", title: "输入文本", desc: "粘贴或从文档库选择" },
              { step: "2", title: "AI 提炼", desc: "系统自动提取结构化知识" },
              { step: "3", title: "人工审核", desc: "预览、编辑、确认或拒绝" },
              { step: "4", title: "入库沉淀", desc: "确认后写入知识库（待审核状态）" },
            ].map((s) => (
              <div key={s.step} className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  {s.step}
                </span>
                <div>
                  <p className="font-medium text-gray-800">{s.title}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
