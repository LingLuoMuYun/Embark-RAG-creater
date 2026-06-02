"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import CandidateList from "@/features/extraction/components/candidate-list";
import CandidateEditor from "@/features/extraction/components/candidate-editor";

interface Candidate {
  id: string;
  title: string;
  content: string;
  suggested_category: string | null;
  suggested_tags: string[];
  type: string;
  status: string;
}

interface KnowledgeBaseItem {
  id: string;
  name: string;
  description?: string;
  status: string;
}

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<Candidate | null>(null);
  const [message, setMessage] = useState("");

  // KB 选择器状态
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [kbDropdownOpen, setKbDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const router = useRouter();

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge/candidates");
      const data = await res.json();
      if (data.success) {
        setCandidates(data.data.candidates);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchKnowledgeBases = async () => {
    try {
      const res = await fetch("/api/rag-management/knowledge-bases");
      const json = await res.json();
      // 兼容 { success, data } 和直接数组两种格式
      const list = json?.data ?? json;
      if (Array.isArray(list)) {
        setKnowledgeBases(
          list.filter((kb: KnowledgeBaseItem) => kb.status === "active")
        );
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchCandidates();
    fetchKnowledgeBases();
  }, []);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setKbDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleKb = (id: string) => {
    setSelectedKbIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleConfirm = async (ids: string[]) => {
    setActionLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/knowledge/candidates/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, knowledgeBaseIds: selectedKbIds }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(
          `已将 ${ids.length} 条知识确认入库到 ${selectedKbIds.length} 个知识库`
        );
        // 跳转到第一个选中的知识库详情页
        if (selectedKbIds.length > 0) {
          setTimeout(() => {
            router.push(`/knowledge-bases/${selectedKbIds[0]}`);
          }, 800);
        } else {
          fetchCandidates();
        }
      }
    } catch {
      setMessage("操作失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const res = await fetch(`/api/knowledge/candidates/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setCandidates((prev) => prev.filter((c) => c.id !== id));
        setMessage("已拒绝该候选知识");
      }
    } catch {
      setMessage("操作失败");
    }
  };

  const handleRetry = () => {
    router.push("/documents");
  };

  const handleEditSave = async (updated: Omit<Candidate, "status">) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === updated.id ? { ...updated, status: c.status } : c
      )
    );
    setEditTarget(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">审核工作台</h1>
            <p className="text-gray-500 mt-1">
              审核 AI 生成的候选知识，编辑后确认入库或拒绝
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/documents")}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              ← 返回文档管理
            </button>
            <button
              onClick={fetchCandidates}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              刷新列表
            </button>
          </div>
        </div>

        {/* 知识库选择器 */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
              目标知识库：
            </span>
            <div className="relative flex-1" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setKbDropdownOpen(!kbDropdownOpen)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg bg-white hover:bg-gray-50 transition-colors ${
                  selectedKbIds.length === 0
                    ? "border-amber-300 text-gray-400"
                    : "border-gray-300 text-gray-700"
                }`}
              >
                <span>
                  {selectedKbIds.length === 0
                    ? "请选择目标知识库..."
                    : `已选 ${selectedKbIds.length} 个知识库`}
                </span>
                <svg
                  className={`h-4 w-4 ml-2 transition-transform ${
                    kbDropdownOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {kbDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {knowledgeBases.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400">
                      暂无可用知识库，请先创建
                    </div>
                  ) : (
                    knowledgeBases.map((kb) => (
                      <label
                        key={kb.id}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedKbIds.includes(kb.id)}
                          onChange={() => toggleKb(kb.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600"
                        />
                        <span className="text-gray-700">{kb.name}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 已选 KB 标签 */}
          {selectedKbIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {selectedKbIds.map((id) => {
                const kb = knowledgeBases.find((k) => k.id === id);
                return kb ? (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200"
                  >
                    {kb.name}
                    <button
                      type="button"
                      onClick={() => toggleKb(id)}
                      className="ml-0.5 hover:text-blue-900"
                    >
                      ×
                    </button>
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>

        {message && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
            {message}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : (
          <CandidateList
            candidates={candidates}
            onConfirm={handleConfirm}
            onReject={handleReject}
            onEdit={(c) => setEditTarget({ ...c, status: "pending" })}
            onRetry={handleRetry}
            loading={actionLoading}
            selectedKbCount={selectedKbIds.length}
          />
        )}

        {editTarget && (
          <CandidateEditor
            candidate={editTarget}
            onSave={handleEditSave}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </div>
    </div>
  );
}
