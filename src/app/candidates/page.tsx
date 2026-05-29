"use client";

import { useState, useEffect } from "react";
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

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<Candidate | null>(
    null
  );
  const [message, setMessage] = useState("");
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

  useEffect(() => {
    fetchCandidates();
  }, []);

  const handleConfirm = async (ids: string[]) => {
    setActionLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/knowledge/candidates/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`已确认 ${ids.length} 条知识，进入待审核状态`);
        fetchCandidates();
      }
    } catch {
      setMessage("操作失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const res = await fetch(
        `/api/knowledge/candidates/${id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        setCandidates((prev) =>
          prev.filter((c) => c.id !== id)
        );
        setMessage("已拒绝该候选知识");
      }
    } catch {
      setMessage("操作失败");
    }
  };

  const handleRetry = () => {
    router.push("/extraction");
  };

  const handleEditSave = async (
    updated: Omit<Candidate, "status">
  ) => {
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === updated.id
          ? { ...updated, status: c.status }
          : c
      )
    );
    setEditTarget(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              审核工作台
            </h1>
            <p className="text-gray-500 mt-1">
              审核 AI 生成的候选知识，编辑后确认入库或拒绝
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/extraction")}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              ← 返回提炼
            </button>
            <button
              onClick={fetchCandidates}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              刷新列表
            </button>
          </div>
        </div>

        {message && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
            {message}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-400">
            加载中...
          </div>
        ) : (
          <CandidateList
            candidates={candidates}
            onConfirm={handleConfirm}
            onReject={handleReject}
            onEdit={(c) => setEditTarget({ ...c, status: "pending" })}
            onRetry={handleRetry}
            loading={actionLoading}
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
