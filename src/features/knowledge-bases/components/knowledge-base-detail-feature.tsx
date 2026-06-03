"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  bindKnowledgeBaseDocuments,
  fetchKnowledgeSourceDocuments,
  fetchRagDetail,
  unbindKnowledgeBaseDocuments,
} from "@/features/knowledge-bases/api";
import type { RagDoc } from "@/features/knowledge-bases/types";
import { normalizeRagDoc } from "@/features/knowledge-bases/utils";

import { DocumentAssignmentPanel } from "./document-assignment-panel";

type DetailRecord = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  similarityThreshold: number;
  topK: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  documents?: unknown[];
};

function isDetailRecord(value: unknown): value is DetailRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value
  );
}

function difference(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((id) => !rightSet.has(id));
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;

  const leftSet = new Set(left);
  return right.every((id) => leftSet.has(id));
}

function formatDate(value?: string) {
  if (!value) return "--";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}

export function KnowledgeBaseDetailFeature() {
  const router = useRouter();
  const params = useParams();
  const knowledgeBaseId = String(params.id ?? "");

  const [detail, setDetail] = React.useState<DetailRecord | null>(null);
  const [selectedDocuments, setSelectedDocuments] = React.useState<RagDoc[]>([]);
  const [availableDocuments, setAvailableDocuments] = React.useState<RagDoc[]>(
    []
  );
  const [initialSelectedDocumentIds, setInitialSelectedDocumentIds] =
    React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedIds = React.useMemo(
    () => selectedDocuments.map((document) => document.id),
    [selectedDocuments]
  );
  const dirty = React.useMemo(
    () => !sameIds(selectedIds, initialSelectedDocumentIds),
    [initialSelectedDocumentIds, selectedIds]
  );

  const loadData = React.useCallback(async () => {
    if (!knowledgeBaseId) return;

    setLoading(true);
    setError(null);

    try {
      const [detailInput, sourceInput] = await Promise.all([
        fetchRagDetail(knowledgeBaseId),
        fetchKnowledgeSourceDocuments(),
      ]);

      if (!isDetailRecord(detailInput)) {
        throw new Error("知识库详情数据格式异常");
      }

      const selected = Array.isArray(detailInput.documents)
        ? detailInput.documents.map(normalizeRagDoc)
        : [];
      const selectedIdSet = new Set(selected.map((document) => document.id));
      const sourceDocuments = Array.isArray(sourceInput)
        ? sourceInput.map(normalizeRagDoc)
        : [];
      const available = sourceDocuments.filter(
        (document) =>
          document.status === "parsed" &&
          document.activeStatus === "active" &&
          !selectedIdSet.has(document.id)
      );

      setDetail(detailInput);
      setSelectedDocuments(selected);
      setAvailableDocuments(available);
      setInitialSelectedDocumentIds(selected.map((document) => document.id));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "知识库详情加载失败"
      );
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId]);

  React.useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, [loadData]);

  function handleEnableDocument(documentId: string) {
    const document = availableDocuments.find((item) => item.id === documentId);
    if (!document || saving) return;

    setAvailableDocuments((current) =>
      current.filter((item) => item.id !== documentId)
    );
    setSelectedDocuments((current) => [...current, document]);
  }

  function handleRemoveDocument(documentId: string) {
    const document = selectedDocuments.find((item) => item.id === documentId);
    if (!document || saving) return;

    setSelectedDocuments((current) =>
      current.filter((item) => item.id !== documentId)
    );
    setAvailableDocuments((current) => [document, ...current]);
  }

  async function handleSaveAssignments() {
    if (!dirty || saving || !knowledgeBaseId) return;

    const currentIds = selectedDocuments.map((document) => document.id);
    const toAdd = difference(currentIds, initialSelectedDocumentIds);
    const toRemove = difference(initialSelectedDocumentIds, currentIds);

    if (toAdd.length === 0 && toRemove.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      if (toAdd.length > 0) {
        await bindKnowledgeBaseDocuments(knowledgeBaseId, toAdd);
      }

      if (toRemove.length > 0) {
        await unbindKnowledgeBaseDocuments(knowledgeBaseId, toRemove);
      }

      await loadData();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "文档配置保存失败"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <Button
        type="button"
        variant="ghost"
        className="px-0 text-muted-foreground"
        onClick={() => router.push("/knowledge-bases")}
      >
        <ArrowLeft data-icon="inline-start" />
        返回知识库列表
      </Button>

      {error ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">
          <AlertCircle className="size-4" />
          {error}
        </div>
      ) : null}

      {detail && !loading ? (
        <Card>
          <CardHeader>
            <CardTitle>{detail.name}</CardTitle>
            <CardDescription>
              {detail.description || "暂无描述"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-4">
            <div>状态：{detail.status}</div>
            <div>TopK：{detail.topK}</div>
            <div>相似度阈值：{detail.similarityThreshold}</div>
            <div>更新时间：{formatDate(detail.updatedAt)}</div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div className="rounded-md border bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
          正在加载知识库详情...
        </div>
      ) : detail ? (
        <DocumentAssignmentPanel
          availableDocuments={availableDocuments}
          dirty={dirty}
          onEnable={handleEnableDocument}
          onRemove={handleRemoveDocument}
          onSave={() => void handleSaveAssignments()}
          saving={saving}
          selectedDocuments={selectedDocuments}
        />
      ) : null}
    </section>
  );
}
